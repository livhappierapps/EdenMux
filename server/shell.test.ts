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

test("shell blocks even authenticated execution until isolation is available", async () => {
  await withShellServer(async (connect) => {
    const socket = await connect("?sessionId=first-message-auth-test");
    const closed = waitForClose(socket);
    socket.send(JSON.stringify({
      type: "auth",
      token: jwt.sign({ userId: "shell-ws-test-user" }, TEST_SECRET, { expiresIn: "1m" }),
    }));

    const result = await closed;
    assert.equal(result.code, 4503);
    assert.match(result.reason, /isolated execution required/);
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

test("shell keeps the iOS restriction for authenticated clients", async () => {
  await withShellServer(async (connect) => {
    const socket = await connect();
    const closed = waitForClose(socket);
    socket.send(JSON.stringify({
      type: "auth",
      token: jwt.sign({ userId: "ios-lab-test-user", platform: "ios" }, TEST_SECRET, { expiresIn: "1m" }),
    }));
    assert.equal((await closed).code, 4403);
  });
});

test("shell rejects malformed messages without starting execution", async () => {
  await withShellServer(async (connect) => {
    const socket = await connect();
    const closed = waitForClose(socket);
    socket.send("{");
    assert.equal((await closed).code, 4400);
  });
});

test("shell rejects an invalid JWT", async () => {
  await withShellServer(async (connect) => {
    const socket = await connect();
    const closed = waitForClose(socket);
    socket.send(JSON.stringify({ type: "auth", token: "not-a-jwt" }));
    assert.equal((await closed).code, 4401);
  });
});
