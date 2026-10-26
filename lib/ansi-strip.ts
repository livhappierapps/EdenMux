const ANSI_RE = [
  /[\u001b\u009b]\[[0-9;?]*[A-Za-z]/g,
  /[\u001b\u009b][@-_][0-9;]*/g,
  /[\u001b\u009b]\][^\u0007]*(?:\u0007|\u001b\\)/g,
  /[\u001b\u009b][PX^_].*?(?:\u001b\\|[\u0007\u009c])/g,
  /[\u001b\u009b]./g,
];

const CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

export function stripAnsi(str: string): string {
  let s = str;
  for (const re of ANSI_RE) {
    re.lastIndex = 0;
    s = s.replace(re, '');
  }
  return s.replace(CTRL_RE, '');
}

export function splitLines(raw: string): string[] {
  const lines: string[] = [];
  const parts = raw.split(/\r\n|\n/);
  for (const part of parts) {
    const crParts = part.split('\r');
    let current = '';
    for (const cr of crParts) {
      if (cr.length > 0) current = cr;
    }
    lines.push(current);
  }
  return lines;
}
