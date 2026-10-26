import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import WebSocket from "ws";

const TEST_SECRET = "shell-websocket-auth-test-secret";

async function withShellServer(
  run: (connect: (query?: string) => Promise<WebSocket>) => Promise<void>,
) {
  process.env.SESSION_SECRET = TEST_SECRET;
  const { attachShellWebSocket } = await import("./shell");
  const httpServer = createServer();
  const clients = new Set<WebSocket>();
  attachShellWebSocket(httpServer);

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const address = httpServer.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `ws://127.0.0.1:${address.port}/ws/shell`;

  const connect = async (query = "") => {
    const socket = new WebSocket(`${baseUrl}${query}`);
    clients.add(socket);
    await once(socket, "open");
    return socket;
  };

  try {
    await run(connect);
  } finally {
    for (const socket of clients) {
      if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
    }
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => error ? reject(error) : resolve());
    });
  }
}

function waitForMessage(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for a WebSocket message."));
    }, 5_000);

    const onMessage = (raw: WebSocket.RawData) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      if (predicate(message)) {
        cleanup();
        resolve(message);
      }
    };
    const onClose = () => {
      cleanup();
      reject(new Error("WebSocket closed before the expected message."));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("close", onClose);
      socket.off("error", onError);
    };

    socket.on("message", onMessage);
    socket.once("close", onClose);
    socket.once("error", onError);
  });
}

function waitForClose(socket: WebSocket) {
  return new Promise<{ code: number; reason: string }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("Timed out waiting for the WebSocket to close."));
    }, 5_000);
    socket.once("close", (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

test("shell accepts a valid JWT in the first WebSocket message", async () => {
  await withShellServer(async (connect) => {
    const socket = await connect("?sessionId=first-message-auth-test");
    const ready = waitForMessage(socket, (message) => message.type === "ready");
    socket.send(JSON.stringify({
      type: "auth",
      token: jwt.sign({ userId: "shell-ws-test-user" }, TEST_SECRET, { expiresIn: "1m" }),
    }));

    assert.equal((await ready).type, "ready");
    const closed = waitForClose(socket);
    socket.send(JSON.stringify({ type: "input", data: "exit\r" }));
    await closed;
  });
});

test("shell rejects a valid JWT supplied only in the URL", async () => {
  await withShellServer(async (connect) => {
    const token = jwt.sign(
      { userId: "shell-ws-query-test-user", platform: "ios" },
      TEST_SECRET,
      { expiresIn: "1m" },
    );
    const socket = await connect(`?sessionId=query-token-test&token=${encodeURIComponent(token)}`);
    const closed = waitForClose(socket);
    socket.send(JSON.stringify({ type: "ping" }));

    assert.equal((await closed).code, 4401);
  });
});

test("shell rejects messages from connections with no authentication", async () => {
  await withShellServer(async (connect) => {
    const socket = await connect("?sessionId=unauthenticated-test");
    const closed = waitForClose(socket);
    socket.send(JSON.stringify({ type: "ping" }));

    assert.equal((await closed).code, 4401);
  });
});
