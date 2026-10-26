import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

export interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'info' | 'success' | 'warning' | 'system';
  content: string;
  timestamp: number;
}

export interface TerminalSession {
  id: string;
  name: string;
  lines: TerminalLine[];
  cwd: string;
  history: string[];
  historyIndex: number;
  env: Record<string, string>;
  aliases: Record<string, string>;
  installedPackages: Record<string, string>;
  createdAt: number;
}

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

const BASE_DIR = FileSystem.documentDirectory || '';

const HOME_DIRS = [
  'storage/',
  'storage/downloads/',
  'storage/shared/',
  'storage/dcim/',
  'storage/music/',
  'storage/pictures/',
  'downloads/',
  'projects/',
  'scripts/',
  '.config/',
  '.local/',
  '.cache/',
];

const MOTD = `Welcome to EdenMux v1.0
  Docs:    https://edenmux.dev
  Home:    ~ (use cd ~ to return)
  Storage: ~/storage`;

const PROFILE_CONTENT = `# EdenMux shell profile
# Add your custom aliases and environment variables here
# Example: alias ll="ls -la"
`;

export async function initHomeDirectory(): Promise<void> {
  try {
    for (const dir of HOME_DIRS) {
      const fullPath = BASE_DIR + dir;
      const info = await FileSystem.getInfoAsync(fullPath);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(fullPath, { intermediates: true });
      }
    }
    const motdPath = BASE_DIR + '.config/motd';
    const motdInfo = await FileSystem.getInfoAsync(motdPath);
    if (!motdInfo.exists) {
      await FileSystem.writeAsStringAsync(motdPath, MOTD);
    }
    const profilePath = BASE_DIR + '.profile';
    const profileInfo = await FileSystem.getInfoAsync(profilePath);
    if (!profileInfo.exists) {
      await FileSystem.writeAsStringAsync(profilePath, PROFILE_CONTENT);
    }
  } catch {}
}

function resolveRelativePath(cwd: string, inputPath: string): string {
  if (!inputPath) return cwd;
  if (inputPath.startsWith('/')) {
    if (inputPath.startsWith(BASE_DIR)) return inputPath;
    return BASE_DIR + inputPath.replace(/^\//, '');
  }
  if (inputPath === '~') return BASE_DIR;
  if (inputPath.startsWith('~/')) return BASE_DIR + inputPath.slice(2);
  if (inputPath === '-') return BASE_DIR;

  let parts = cwd.replace(BASE_DIR, '').split('/').filter(Boolean);
  const segments = inputPath.split('/');
  for (const seg of segments) {
    if (seg === '..') {
      parts.pop();
    } else if (seg !== '.' && seg !== '') {
      parts.push(seg);
    }
  }
  return BASE_DIR + parts.join('/') + (parts.length > 0 ? '/' : '');
}

function getDisplayPath(fullPath: string): string {
  if (!fullPath || fullPath === BASE_DIR) return '~';
  const rel = fullPath.replace(BASE_DIR, '');
  return '~/' + rel.replace(/\/$/, '');
}

function parseArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) args.push(current);
  return args;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists && info.isDirectory;
  } catch {
    return false;
  }
}

function formatSize(size: number): string {
  if (size > 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)}G`;
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}M`;
  if (size > 1024) return `${(size / 1024).toFixed(1)}K`;
  return `${size}`;
}

interface PackageInfo {
  version: string;
  description: string;
  size: string;
  section: string;
  depends?: string[];
}

const PACKAGE_REGISTRY: Record<string, PackageInfo> = {
  'bash': { version: '5.2.26-1', description: 'The GNU Bourne Again SHell', size: '1.8M', section: 'shells', depends: ['ncurses', 'readline'] },
  'coreutils': { version: '9.5-1', description: 'Basic file, shell and text manipulation utilities', size: '3.2M', section: 'utils' },
  'busybox': { version: '1.36.1-4', description: 'Tiny utilities for small systems', size: '624K', section: 'utils' },
  'curl': { version: '8.7.1-1', description: 'Command line tool for transferring data with URLs', size: '1.1M', section: 'net', depends: ['openssl', 'libnghttp2', 'zlib'] },
  'wget': { version: '1.24.5-1', description: 'Network utility to retrieve files from the web', size: '820K', section: 'net', depends: ['openssl', 'zlib'] },
  'git': { version: '2.45.1-1', description: 'Fast, scalable distributed revision control system', size: '12.4M', section: 'devel', depends: ['curl', 'openssl', 'zlib', 'perl'] },
  'openssh': { version: '9.7p1-1', description: 'Secure shell (SSH) client and server', size: '2.8M', section: 'net', depends: ['openssl', 'zlib'] },
  'openssl': { version: '3.3.0-1', description: 'Library and toolkit for Secure Sockets Layer', size: '8.6M', section: 'libs' },
  'python': { version: '3.12.3-1', description: 'Python programming language', size: '28.5M', section: 'devel', depends: ['openssl', 'zlib', 'libffi', 'readline', 'ncurses'] },
  'python-pip': { version: '24.0-1', description: 'Package installer for Python', size: '4.2M', section: 'devel', depends: ['python'] },
  'nodejs': { version: '22.2.0-1', description: 'Platform built on V8 JavaScript engine', size: '18.2M', section: 'devel', depends: ['openssl', 'zlib'] },
  'nodejs-lts': { version: '20.13.1-1', description: 'Node.js LTS release', size: '17.8M', section: 'devel', depends: ['openssl', 'zlib'] },
  'vim': { version: '9.1.400-1', description: 'Vi IMproved - enhanced vi editor', size: '4.6M', section: 'editors', depends: ['ncurses'] },
  'nano': { version: '8.0-1', description: 'Easy-to-use text editor', size: '920K', section: 'editors', depends: ['ncurses'] },
  'neovim': { version: '0.10.0-1', description: 'Ambitious Vim-fork focused on extensibility', size: '8.4M', section: 'editors', depends: ['ncurses', 'lua5.4'] },
  'lua5.4': { version: '5.4.6-2', description: 'Lightweight embeddable scripting language', size: '520K', section: 'devel' },
  'ruby': { version: '3.3.1-1', description: 'Dynamic programming language with object-oriented features', size: '14.2M', section: 'devel', depends: ['openssl', 'zlib', 'readline', 'libffi'] },
  'perl': { version: '5.38.2-3', description: 'Larry Wall\'s Practical Extraction and Reporting Language', size: '22.4M', section: 'devel' },
  'clang': { version: '18.1.5-1', description: 'C/C++/ObjC compiler based on LLVM', size: '86.2M', section: 'devel' },
  'golang': { version: '1.22.3-1', description: 'Go programming language compiler', size: '62.8M', section: 'devel' },
  'rust': { version: '1.78.0-1', description: 'Systems programming language', size: '74.6M', section: 'devel' },
  'make': { version: '4.4.1-1', description: 'Utility for directing compilation', size: '540K', section: 'devel' },
  'cmake': { version: '3.29.3-1', description: 'Cross-platform make system', size: '8.8M', section: 'devel', depends: ['make'] },
  'pkg-config': { version: '0.29.2-5', description: 'Helper tool for compiling applications', size: '120K', section: 'devel' },
  'jq': { version: '1.7.1-1', description: 'Command-line JSON processor', size: '380K', section: 'utils' },
  'yq': { version: '4.43.1-1', description: 'Command-line YAML/XML/TOML processor', size: '4.2M', section: 'utils' },
  'tree': { version: '2.1.1-1', description: 'Recursive directory listing command', size: '96K', section: 'utils' },
  'htop': { version: '3.3.0-1', description: 'Interactive process viewer', size: '420K', section: 'utils', depends: ['ncurses'] },
  'less': { version: '643-1', description: 'Terminal pager program', size: '340K', section: 'utils', depends: ['ncurses'] },
  'man': { version: '1.14.6-2', description: 'Man page viewer', size: '260K', section: 'utils', depends: ['less'] },
  'ncurses': { version: '6.4.20231001-4', description: 'Terminal-independent method of screen updates', size: '2.4M', section: 'libs' },
  'readline': { version: '8.2.10-1', description: 'GNU readline library', size: '560K', section: 'libs', depends: ['ncurses'] },
  'zlib': { version: '1.3.1-1', description: 'Compression library', size: '160K', section: 'libs' },
  'libffi': { version: '3.4.6-1', description: 'Portable foreign function interface library', size: '88K', section: 'libs' },
  'libnghttp2': { version: '1.61.0-1', description: 'HTTP/2 library', size: '280K', section: 'libs' },
  'tar': { version: '1.35-2', description: 'GNU tar for managing tar archives', size: '780K', section: 'utils' },
  'gzip': { version: '1.13-1', description: 'GNU compression utility', size: '180K', section: 'utils', depends: ['zlib'] },
  'unzip': { version: '6.0-9', description: 'Extract files from ZIP archives', size: '340K', section: 'utils' },
  'zip': { version: '3.0-5', description: 'Create ZIP archives', size: '280K', section: 'utils' },
  'file': { version: '5.45-2', description: 'File type identification utility', size: '4.2M', section: 'utils' },
  'sed': { version: '4.9-2', description: 'GNU stream editor', size: '340K', section: 'utils' },
  'awk': { version: '5.3.0-1', description: 'Pattern-directed scanning and processing', size: '620K', section: 'utils' },
  'grep': { version: '3.11-1', description: 'GNU grep pattern matching utility', size: '420K', section: 'utils' },
  'diffutils': { version: '3.10-1', description: 'File comparison utilities', size: '480K', section: 'utils' },
  'patch': { version: '2.7.6-4', description: 'Apply diffs to originals', size: '220K', section: 'utils', depends: ['diffutils'] },
  'findutils': { version: '4.9.0-3', description: 'GNU find, xargs and locate', size: '680K', section: 'utils' },
  'which': { version: '2.21-3', description: 'Shows the full path of commands', size: '40K', section: 'utils' },
  'tmux': { version: '3.4-1', description: 'Terminal multiplexer', size: '860K', section: 'utils', depends: ['ncurses'] },
  'screen': { version: '4.9.1-1', description: 'Terminal multiplexer with VT100/ANSI emulation', size: '920K', section: 'utils', depends: ['ncurses'] },
  'nmap': { version: '7.95-1', description: 'Network mapper and security scanner', size: '6.2M', section: 'net', depends: ['openssl'] },
  'iproute2': { version: '6.9.0-1', description: 'Networking and traffic control tools', size: '1.2M', section: 'net' },
  'net-tools': { version: '2.10-1', description: 'Classic networking tools (ifconfig, etc.)', size: '380K', section: 'net' },
  'dnsutils': { version: '9.18.27-1', description: 'DNS utilities (dig, nslookup, etc.)', size: '1.4M', section: 'net' },
  'ffmpeg': { version: '7.0-1', description: 'Audio/video converter and streaming tool', size: '24.8M', section: 'multimedia' },
  'imagemagick': { version: '7.1.1.32-1', description: 'Image manipulation tools', size: '8.4M', section: 'multimedia' },
  'sqlite': { version: '3.45.3-1', description: 'Lightweight SQL database engine', size: '1.6M', section: 'database' },
  'mariadb': { version: '11.3.2-1', description: 'Community-developed fork of MySQL', size: '42.8M', section: 'database' },
  'redis': { version: '7.2.4-1', description: 'In-memory data structure store', size: '3.2M', section: 'database' },
  'postgresql': { version: '16.2-1', description: 'Advanced object-relational database', size: '18.6M', section: 'database' },
  'ldd': { version: '0.3-1', description: 'Shared library dependency viewer', size: '28K', section: 'utils' },
  'strace': { version: '6.8-1', description: 'Trace system calls and signals', size: '1.4M', section: 'devel' },
  'gdb': { version: '14.2-1', description: 'GNU debugger', size: '12.6M', section: 'devel' },
  'binutils': { version: '2.42-1', description: 'GNU assembler, linker and binary utilities', size: '14.2M', section: 'devel' },
  'edenmux-api': { version: '0.58.0-1', description: 'EdenMux device API access', size: '120K', section: 'system' },
  'edenmux-tools': { version: '1.42.2-1', description: 'Basic system tools for EdenMux', size: '84K', section: 'system' },
  'apt': { version: '2.7.14-1', description: 'Debian package management tools', size: '3.6M', section: 'system' },
  'dpkg': { version: '1.22.6-1', description: 'Debian package management system', size: '2.4M', section: 'system' },
  'gnupg': { version: '2.4.5-1', description: 'GNU privacy guard - encryption tool', size: '4.8M', section: 'security' },
  'pass': { version: '1.7.4-3', description: 'Lightweight password manager', size: '64K', section: 'security', depends: ['gnupg', 'git', 'tree'] },
  'tor': { version: '0.4.8.11-1', description: 'The Onion Router anonymity network', size: '3.4M', section: 'net', depends: ['openssl', 'zlib'] },
  'neofetch': { version: '7.1.0-3', description: 'System information tool', size: '380K', section: 'utils' },
  'figlet': { version: '2.2.5-3', description: 'Display large characters made up of text', size: '1.2M', section: 'utils' },
  'fortune': { version: '1.0-2', description: 'Print random, hopefully interesting, adages', size: '2.8M', section: 'utils' },
  'cowsay': { version: '3.04-2', description: 'Configurable speaking cow', size: '48K', section: 'utils', depends: ['perl'] },
  'sl': { version: '5.05-1', description: 'Steam Locomotive runs across your terminal', size: '28K', section: 'utils', depends: ['ncurses'] },
  'cmatrix': { version: '2.0-3', description: 'Simulates the display from The Matrix', size: '40K', section: 'utils', depends: ['ncurses'] },
};

const DEFAULT_INSTALLED: Record<string, string> = {
  'apt': '2.7.14-1',
  'bash': '5.2.26-1',
  'busybox': '1.36.1-4',
  'coreutils': '9.5-1',
  'dpkg': '1.22.6-1',
  'ncurses': '6.4.20231001-4',
  'readline': '8.2.10-1',
  'zlib': '1.3.1-1',
  'openssl': '3.3.0-1',
  'curl': '8.7.1-1',
  'less': '643-1',
  'tar': '1.35-2',
  'gzip': '1.13-1',
  'sed': '4.9-2',
  'awk': '5.3.0-1',
  'grep': '3.11-1',
  'findutils': '4.9.0-3',
  'diffutils': '3.10-1',
  'which': '2.21-3',
  'file': '5.45-2',
  'edenmux-tools': '1.42.2-1',
  'edenmux-api': '0.58.0-1',
  'nano': '8.0-1',
  'man': '1.14.6-2',
  'jq': '1.7.1-1',
  'tree': '2.1.1-1',
  'unzip': '6.0-9',
  'zip': '3.0-5',
  'libffi': '3.4.6-1',
  'libnghttp2': '1.61.0-1',
  'pkg-config': '0.29.2-5',
  'make': '4.4.1-1',
  'neofetch': '7.1.0-3',
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function evalMath(expr: string): number {
  const s = expr.replace(/\s/g, '');
  let i = 0;
  function parseE(): number {
    let x = parseT();
    while (i < s.length && (s[i] === '+' || s[i] === '-')) {
      const op = s[i++]; x = op === '+' ? x + parseT() : x - parseT();
    }
    return x;
  }
  function parseT(): number {
    let x = parseP();
    while (i < s.length && (s[i] === '*' || s[i] === '/' || s[i] === '%')) {
      const op = s[i++]; const y = parseP();
      x = op === '*' ? x * y : op === '/' ? x / y : x % y;
    }
    return x;
  }
  function parseP(): number {
    const base = parseU();
    if (s[i] === '^') { i++; return Math.pow(base, parseU()); }
    return base;
  }
  function parseU(): number {
    if (s[i] === '-') { i++; return -parseAtom(); }
    if (s[i] === '+') { i++; return parseAtom(); }
    return parseAtom();
  }
  function parseAtom(): number {
    if (s[i] === '(') {
      i++;
      const x = parseE();
      if (s[i] === ')') i++;
      return x;
    }
    const start = i;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    if (i === start) throw new Error('unexpected: ' + (s[i] ?? 'end'));
    return parseFloat(s.slice(start, i));
  }
  const result = parseE();
  if (i < s.length) throw new Error('unexpected token: ' + s[i]);
  if (!isFinite(result)) throw new Error('result is not finite');
  return result;
}

const ALL_COMMANDS = [
  'help', 'ls', 'cd', 'pwd', 'mkdir', 'touch', 'cat', 'echo', 'rm', 'rmdir',
  'cp', 'mv', 'head', 'tail', 'wc', 'find', 'grep', 'du', 'df', 'stat', 'file',
  'sort', 'uniq', 'tr', 'cut', 'tee', 'rev', 'fold', 'nl', 'diff',
  'basename', 'dirname', 'realpath', 'readlink', 'ln',
  'date', 'whoami', 'id', 'hostname', 'uname', 'uptime', 'w',
  'env', 'printenv', 'export', 'unset', 'set', 'alias', 'unalias', 'type', 'which',
  'history', 'clear', 'reset',
  'copy', 'paste',
  'calc',
  'base64', 'hex', 'md5sum', 'sha256sum',
  'seq', 'yes', 'sleep', 'true', 'false',
  'xargs', 'test',
  'motd', 'cowsay', 'fortune', 'banner', 'neofetch',
  'apt', 'apt-get', 'apt-cache', 'pkg', 'dpkg',
  'exit', 'logout',
];

export async function executeCommand(
  rawInput: string,
  session: TerminalSession
): Promise<{ lines: TerminalLine[]; newCwd: string; newEnv: Record<string, string>; newAliases: Record<string, string>; newInstalledPackages: Record<string, string> }> {
  const input = rawInput.trim();
  const lines: TerminalLine[] = [];
  let newCwd = session.cwd;
  let newEnv = { ...session.env };
  let newAliases = { ...(session.aliases || {}) };
  let newInstalledPackages = { ...(session.installedPackages || DEFAULT_INSTALLED) };

  if (!input) return { lines, newCwd, newEnv, newAliases, newInstalledPackages };

  let expandedInput = input;
  if (session.aliases) {
    const firstWord = input.split(/\s+/)[0];
    if (session.aliases[firstWord]) {
      expandedInput = session.aliases[firstWord] + input.slice(firstWord.length);
    }
  }

  const pipeIndex = expandedInput.indexOf('|');
  if (pipeIndex > 0) {
    const leftCmd = expandedInput.slice(0, pipeIndex).trim();
    const rightCmd = expandedInput.slice(pipeIndex + 1).trim();
    const leftResult = await executeCommand(leftCmd, session);
    const pipeOutput = leftResult.lines
      .filter(l => l.type === 'output')
      .map(l => l.content)
      .join('\n');
    const pipeSession = { ...session, cwd: leftResult.newCwd, env: leftResult.newEnv, installedPackages: leftResult.newInstalledPackages };
    const rightResult = await executeCommand(`${rightCmd} <<PIPE<<${pipeOutput}`, pipeSession);
    return {
      lines: rightResult.lines,
      newCwd: rightResult.newCwd,
      newEnv: rightResult.newEnv,
      newAliases: rightResult.newAliases ?? newAliases,
      newInstalledPackages: rightResult.newInstalledPackages ?? newInstalledPackages,
    };
  }

  let pipeInput: string | null = null;
  let actualInput = expandedInput;
  const pipeMarker = '<<PIPE<<';
  const pipePos = expandedInput.indexOf(pipeMarker);
  if (pipePos >= 0) {
    actualInput = expandedInput.slice(0, pipePos).trim();
    pipeInput = expandedInput.slice(pipePos + pipeMarker.length);
  }

  const args = parseArgs(actualInput);
  const cmd = args[0].toLowerCase();
  const cmdArgs = args.slice(1);

  const mkLine = (type: TerminalLine['type'], content: string): TerminalLine => ({
    id: generateId(),
    type,
    content,
    timestamp: Date.now(),
  });

  try {
    switch (cmd) {
      case 'help': {
        lines.push(mkLine('info', 'EdenMux - Available Commands'));
        lines.push(mkLine('output', ''));

        lines.push(mkLine('info', '  FILE MANAGEMENT'));
        const fileCmds = [
          ['ls [path]', 'List directory contents (-l -a)'],
          ['cd [path]', 'Change directory (-, ~, ..)'],
          ['pwd', 'Print working directory'],
          ['mkdir [-p] <name>', 'Create directory'],
          ['rmdir <dir>', 'Remove empty directory'],
          ['touch <file>', 'Create empty file'],
          ['cat <file>', 'Display file contents'],
          ['echo <text>', 'Print text (>, >> redirect)'],
          ['rm [-rf] <path>', 'Remove file or directory'],
          ['cp <src> <dst>', 'Copy file'],
          ['mv <src> <dst>', 'Move/rename file'],
          ['ln -s <target> <link>', 'Create symbolic link'],
          ['stat <path>', 'File status/details'],
          ['file <path>', 'Determine file type'],
          ['find <pattern>', 'Search for files'],
          ['du [path]', 'Disk usage'],
          ['df', 'Filesystem space info'],
          ['basename <path>', 'Strip directory from path'],
          ['dirname <path>', 'Strip filename from path'],
          ['realpath <path>', 'Resolve full path'],
        ];
        for (const [name, desc] of fileCmds) {
          lines.push(mkLine('output', `    ${name.padEnd(24)} ${desc}`));
        }

        lines.push(mkLine('output', ''));
        lines.push(mkLine('info', '  TEXT PROCESSING'));
        const textCmds = [
          ['head [-n N] <file>', 'Show first N lines'],
          ['tail [-n N] <file>', 'Show last N lines'],
          ['wc <file>', 'Word/line/char count'],
          ['grep <pattern> <file>', 'Search text in file'],
          ['sort <file>', 'Sort lines'],
          ['uniq <file>', 'Remove duplicate lines'],
          ['tr <from> <to>', 'Translate characters'],
          ['cut -d<D> -f<N> <file>', 'Extract columns'],
          ['tee <file>', 'Read stdin, write to file'],
          ['rev', 'Reverse each line'],
          ['fold [-w N]', 'Wrap lines to width'],
          ['nl <file>', 'Number lines'],
          ['diff <file1> <file2>', 'Compare two files'],
        ];
        for (const [name, desc] of textCmds) {
          lines.push(mkLine('output', `    ${name.padEnd(24)} ${desc}`));
        }

        lines.push(mkLine('output', ''));
        lines.push(mkLine('info', '  SYSTEM & ENV'));
        const sysCmds = [
          ['date', 'Current date/time'],
          ['whoami', 'Current user'],
          ['id', 'User identity info'],
          ['hostname', 'Device hostname'],
          ['uname [-a]', 'System information'],
          ['uptime', 'Session uptime'],
          ['env / printenv', 'Show environment vars'],
          ['export K=V', 'Set environment variable'],
          ['unset <key>', 'Remove variable'],
          ['alias name=cmd', 'Create command alias'],
          ['unalias <name>', 'Remove alias'],
          ['type <cmd>', 'Describe a command'],
          ['which <cmd>', 'Locate a command'],
          ['history', 'Command history'],
          ['clear / reset', 'Clear terminal'],
        ];
        for (const [name, desc] of sysCmds) {
          lines.push(mkLine('output', `    ${name.padEnd(24)} ${desc}`));
        }

        lines.push(mkLine('output', ''));
        lines.push(mkLine('info', '  DEV TOOLS'));
        const devCmds = [
          ['calc <expr>', 'Calculate expression'],
          ['base64 [-d] <text>', 'Base64 encode/decode'],
          ['hex <text>', 'Convert to hexadecimal'],
          ['md5sum <file>', 'MD5 hash of file'],
          ['sha256sum <file>', 'SHA-256 hash of file'],
          ['copy <text>', 'Copy to clipboard'],
          ['paste', 'Paste from clipboard'],
          ['seq <start> <end>', 'Print number sequence'],
          ['sleep <seconds>', 'Wait for duration'],
          ['test <expr>', 'Evaluate expression'],
        ];
        for (const [name, desc] of devCmds) {
          lines.push(mkLine('output', `    ${name.padEnd(24)} ${desc}`));
        }

        lines.push(mkLine('output', ''));
        lines.push(mkLine('info', '  PACKAGE MANAGEMENT'));
        const pkgCmds = [
          ['pkg install <pkg>', 'Install packages'],
          ['pkg uninstall <pkg>', 'Remove packages'],
          ['pkg search <term>', 'Search packages'],
          ['pkg list-installed', 'List installed packages'],
          ['pkg list-all', 'List all packages'],
          ['pkg show <pkg>', 'Package details'],
          ['pkg update', 'Update package index'],
          ['apt install <pkg>', 'Install via apt'],
          ['apt remove <pkg>', 'Remove via apt'],
          ['apt search <term>', 'Search via apt'],
          ['dpkg -l', 'List installed (dpkg)'],
          ['dpkg -s <pkg>', 'Package status'],
        ];
        for (const [name, desc] of pkgCmds) {
          lines.push(mkLine('output', `    ${name.padEnd(24)} ${desc}`));
        }

        lines.push(mkLine('output', ''));
        lines.push(mkLine('info', '  FUN'));
        const funCmds = [
          ['eden', 'Open Eden AI assistant'],
          ['cowsay <text>', 'ASCII cow says text'],
          ['fortune', 'Random fortune'],
          ['sl', 'Steam Locomotive (install first)'],
          ['banner <text>', 'Large text banner'],
          ['motd', 'Message of the day'],
          ['neofetch', 'System information'],
        ];
        for (const [name, desc] of funCmds) {
          lines.push(mkLine('output', `    ${name.padEnd(24)} ${desc}`));
        }

        lines.push(mkLine('output', ''));
        lines.push(mkLine('info', '  Tip: Use | to pipe commands, > to redirect output'));
        break;
      }

      case 'clear':
      case 'reset':
        lines.push(mkLine('system', '__CLEAR__'));
        break;

      case 'pwd':
        lines.push(mkLine('output', getDisplayPath(session.cwd)));
        break;

      case 'cd': {
        const target = cmdArgs[0] || '~';
        const resolved = resolveRelativePath(session.cwd, target);
        if (resolved === BASE_DIR || await isDirectory(resolved)) {
          newCwd = resolved;
        } else {
          lines.push(mkLine('error', `cd: ${target}: No such directory`));
        }
        break;
      }

      case 'ls': {
        const target = cmdArgs.filter(a => !a.startsWith('-'))[0];
        const flags = cmdArgs.filter(a => a.startsWith('-')).join('');
        const showAll = flags.includes('a');
        const longFormat = flags.includes('l');
        const humanReadable = flags.includes('h');
        const dir = target ? resolveRelativePath(session.cwd, target) : session.cwd;

        if (!(await isDirectory(dir))) {
          const fpath = dir.replace(/\/$/, '');
          if (await fileExists(fpath)) {
            const info = await FileSystem.getInfoAsync(fpath);
            lines.push(mkLine('output', `${formatSize(info.exists ? info.size : 0).padStart(8)}  ${target}`));
            break;
          }
          lines.push(mkLine('error', `ls: ${target || '.'}: No such file or directory`));
          break;
        }

        const items = await FileSystem.readDirectoryAsync(dir);
        const filtered = showAll ? items : items.filter(i => !i.startsWith('.'));

        if (filtered.length === 0) {
          lines.push(mkLine('output', '(empty directory)'));
          break;
        }

        if (longFormat) {
          let totalSize = 0;
          for (const item of filtered.sort()) {
            try {
              const info = await FileSystem.getInfoAsync(dir + item);
              const isDir = info.isDirectory;
              const size = info.exists ? info.size : 0;
              totalSize += size;
              const sizeStr = formatSize(size);
              const perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
              lines.push(mkLine('output',
                `${perms}  ${sizeStr.padStart(8)}  ${item}${isDir ? '/' : ''}`
              ));
            } catch {
              lines.push(mkLine('output', `?rw-r--r--         ?  ${item}`));
            }
          }
          lines.push(mkLine('info', `total ${formatSize(totalSize)}`));
        } else {
          const result: string[] = [];
          for (const item of filtered.sort()) {
            const isDir = await isDirectory(dir + item + '/');
            result.push(isDir ? `${item}/` : item);
          }
          lines.push(mkLine('output', result.join('  ')));
        }
        break;
      }

      case 'mkdir': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'mkdir: missing operand'));
          break;
        }
        const name = cmdArgs.filter(a => !a.startsWith('-'))[0] || cmdArgs[0];
        const dirPath = resolveRelativePath(session.cwd, name);
        await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
        break;
      }

      case 'rmdir': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'rmdir: missing operand'));
          break;
        }
        const dirPath = resolveRelativePath(session.cwd, cmdArgs[0]);
        if (!(await isDirectory(dirPath))) {
          lines.push(mkLine('error', `rmdir: ${cmdArgs[0]}: Not a directory`));
          break;
        }
        try {
          const contents = await FileSystem.readDirectoryAsync(dirPath);
          if (contents.length > 0) {
            lines.push(mkLine('error', `rmdir: ${cmdArgs[0]}: Directory not empty`));
          } else {
            await FileSystem.deleteAsync(dirPath, { idempotent: true });
          }
        } catch (e: any) {
          lines.push(mkLine('error', `rmdir: ${e.message}`));
        }
        break;
      }

      case 'touch': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'touch: missing operand'));
          break;
        }
        for (const arg of cmdArgs) {
          const filePath = resolveRelativePath(session.cwd, arg).replace(/\/$/, '');
          if (!(await fileExists(filePath))) {
            await FileSystem.writeAsStringAsync(filePath, '');
          }
        }
        break;
      }

      case 'cat': {
        if (!cmdArgs[0] && pipeInput !== null) {
          pipeInput.split('\n').forEach(line => lines.push(mkLine('output', line)));
          break;
        }
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'cat: missing operand'));
          break;
        }
        for (const arg of cmdArgs.filter(a => !a.startsWith('-'))) {
          const filePath = resolveRelativePath(session.cwd, arg).replace(/\/$/, '');
          if (!(await fileExists(filePath))) {
            lines.push(mkLine('error', `cat: ${arg}: No such file`));
            continue;
          }
          const content = await FileSystem.readAsStringAsync(filePath);
          if (content) {
            content.split('\n').forEach(line => lines.push(mkLine('output', line)));
          }
        }
        break;
      }

      case 'echo': {
        const text = cmdArgs.join(' ');
        const redirectIndex = text.lastIndexOf('>');
        if (redirectIndex > 0) {
          const append = text[redirectIndex - 1] === '>';
          const fileArg = text.slice(redirectIndex + 1).trim();
          const content = text.slice(0, append ? redirectIndex - 1 : redirectIndex).trim();
          const filePath = resolveRelativePath(session.cwd, fileArg).replace(/\/$/, '');
          if (append) {
            let existing = '';
            try { existing = await FileSystem.readAsStringAsync(filePath); } catch {}
            await FileSystem.writeAsStringAsync(filePath, existing + content + '\n');
          } else {
            await FileSystem.writeAsStringAsync(filePath, content + '\n');
          }
        } else {
          const processed = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
          processed.split('\n').forEach(l => lines.push(mkLine('output', l)));
        }
        break;
      }

      case 'rm': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'rm: missing operand'));
          break;
        }
        const targets = cmdArgs.filter(a => !a.startsWith('-'));
        for (const t of targets) {
          const target = resolveRelativePath(session.cwd, t).replace(/\/$/, '');
          if (!(await fileExists(target))) {
            lines.push(mkLine('error', `rm: ${t}: No such file or directory`));
            continue;
          }
          await FileSystem.deleteAsync(target, { idempotent: true });
        }
        break;
      }

      case 'cp': {
        if (cmdArgs.length < 2) {
          lines.push(mkLine('error', 'cp: missing destination'));
          break;
        }
        const src = resolveRelativePath(session.cwd, cmdArgs[0]).replace(/\/$/, '');
        const dst = resolveRelativePath(session.cwd, cmdArgs[1]).replace(/\/$/, '');
        if (!(await fileExists(src))) {
          lines.push(mkLine('error', `cp: ${cmdArgs[0]}: No such file`));
          break;
        }
        await FileSystem.copyAsync({ from: src, to: dst });
        break;
      }

      case 'mv': {
        if (cmdArgs.length < 2) {
          lines.push(mkLine('error', 'mv: missing destination'));
          break;
        }
        const src = resolveRelativePath(session.cwd, cmdArgs[0]).replace(/\/$/, '');
        const dst = resolveRelativePath(session.cwd, cmdArgs[1]).replace(/\/$/, '');
        if (!(await fileExists(src))) {
          lines.push(mkLine('error', `mv: ${cmdArgs[0]}: No such file`));
          break;
        }
        await FileSystem.moveAsync({ from: src, to: dst });
        break;
      }

      case 'ln': {
        lines.push(mkLine('warning', 'ln: symbolic links not supported in sandboxed filesystem'));
        lines.push(mkLine('info', 'Use cp to create a copy instead'));
        break;
      }

      case 'head': {
        let n = 10;
        let fileName = '';
        for (let i = 0; i < cmdArgs.length; i++) {
          if (cmdArgs[i] === '-n' && cmdArgs[i + 1]) {
            n = parseInt(cmdArgs[++i], 10);
          } else if (!cmdArgs[i].startsWith('-')) {
            fileName = cmdArgs[i];
          }
        }
        const textInput = pipeInput ?? (fileName ? await (async () => {
          const fp = resolveRelativePath(session.cwd, fileName).replace(/\/$/, '');
          if (!(await fileExists(fp))) { lines.push(mkLine('error', `head: ${fileName}: No such file`)); return null; }
          return await FileSystem.readAsStringAsync(fp);
        })() : null);
        if (textInput !== null && textInput !== undefined) {
          textInput.split('\n').slice(0, n).forEach(line => lines.push(mkLine('output', line)));
        } else if (!fileName && pipeInput === null) {
          lines.push(mkLine('error', 'head: missing operand'));
        }
        break;
      }

      case 'tail': {
        let n = 10;
        let fileName = '';
        for (let i = 0; i < cmdArgs.length; i++) {
          if (cmdArgs[i] === '-n' && cmdArgs[i + 1]) {
            n = parseInt(cmdArgs[++i], 10);
          } else if (!cmdArgs[i].startsWith('-')) {
            fileName = cmdArgs[i];
          }
        }
        const textInput = pipeInput ?? (fileName ? await (async () => {
          const fp = resolveRelativePath(session.cwd, fileName).replace(/\/$/, '');
          if (!(await fileExists(fp))) { lines.push(mkLine('error', `tail: ${fileName}: No such file`)); return null; }
          return await FileSystem.readAsStringAsync(fp);
        })() : null);
        if (textInput !== null && textInput !== undefined) {
          const allLines = textInput.split('\n');
          allLines.slice(-n).forEach(line => lines.push(mkLine('output', line)));
        } else if (!fileName && pipeInput === null) {
          lines.push(mkLine('error', 'tail: missing operand'));
        }
        break;
      }

      case 'wc': {
        const textInput = pipeInput ?? (cmdArgs[0] ? await (async () => {
          const fp = resolveRelativePath(session.cwd, cmdArgs[0]).replace(/\/$/, '');
          if (!(await fileExists(fp))) { lines.push(mkLine('error', `wc: ${cmdArgs[0]}: No such file`)); return null; }
          return await FileSystem.readAsStringAsync(fp);
        })() : null);
        if (textInput !== null && textInput !== undefined) {
          const lineCount = textInput.split('\n').length;
          const wordCount = textInput.split(/\s+/).filter(Boolean).length;
          const charCount = textInput.length;
          lines.push(mkLine('output', `  ${lineCount} ${wordCount} ${charCount}${cmdArgs[0] ? ' ' + cmdArgs[0] : ''}`));
        } else if (!cmdArgs[0] && pipeInput === null) {
          lines.push(mkLine('error', 'wc: missing operand'));
        }
        break;
      }

      case 'find': {
        const pattern = cmdArgs[0] || '*';
        const searchDir = session.cwd;
        const found: string[] = [];
        async function searchRecursive(dir: string, depth: number) {
          if (depth > 5) return;
          try {
            const items = await FileSystem.readDirectoryAsync(dir);
            for (const item of items) {
              if (item.toLowerCase().includes(pattern.toLowerCase().replace(/\*/g, ''))) {
                found.push(getDisplayPath(dir + item));
              }
              if (await isDirectory(dir + item + '/')) {
                await searchRecursive(dir + item + '/', depth + 1);
              }
            }
          } catch {}
        }
        await searchRecursive(searchDir, 0);
        if (found.length === 0) {
          lines.push(mkLine('output', 'No files found'));
        } else {
          found.forEach(f => lines.push(mkLine('output', f)));
        }
        break;
      }

      case 'grep': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'grep: Usage: grep <pattern> <file>'));
          break;
        }
        const pattern = cmdArgs[0];
        const flags = cmdArgs.filter(a => a.startsWith('-')).join('');
        const ignoreCase = flags.includes('i');
        const countOnly = flags.includes('c');
        const lineNumbers = flags.includes('n');
        const invertMatch = flags.includes('v');
        const textInput = pipeInput ?? (cmdArgs[1] ? await (async () => {
          const fp = resolveRelativePath(session.cwd, cmdArgs.filter(a => !a.startsWith('-'))[1]).replace(/\/$/, '');
          if (!(await fileExists(fp))) { lines.push(mkLine('error', `grep: ${cmdArgs[1]}: No such file`)); return null; }
          return await FileSystem.readAsStringAsync(fp);
        })() : null);
        if (textInput !== null && textInput !== undefined) {
          const fileLines = textInput.split('\n');
          let matchCount = 0;
          fileLines.forEach((line, i) => {
            const haystack = ignoreCase ? line.toLowerCase() : line;
            const needle = ignoreCase ? pattern.toLowerCase() : pattern;
            const matches = haystack.includes(needle);
            if (matches !== invertMatch) {
              matchCount++;
              if (!countOnly) {
                const prefix = lineNumbers ? `${i + 1}:` : '';
                lines.push(mkLine('output', `${prefix}${line}`));
              }
            }
          });
          if (countOnly) {
            lines.push(mkLine('output', `${matchCount}`));
          } else if (matchCount === 0) {
            lines.push(mkLine('output', 'No matches found'));
          }
        } else if (!cmdArgs[1] && pipeInput === null) {
          lines.push(mkLine('error', 'grep: missing file operand'));
        }
        break;
      }

      case 'sort': {
        const flags = cmdArgs.filter(a => a.startsWith('-')).join('');
        const reverse = flags.includes('r');
        const numeric = flags.includes('n');
        const unique = flags.includes('u');
        const textInput = pipeInput ?? (cmdArgs.filter(a => !a.startsWith('-'))[0] ? await (async () => {
          const fn = cmdArgs.filter(a => !a.startsWith('-'))[0];
          const fp = resolveRelativePath(session.cwd, fn).replace(/\/$/, '');
          if (!(await fileExists(fp))) { lines.push(mkLine('error', `sort: ${fn}: No such file`)); return null; }
          return await FileSystem.readAsStringAsync(fp);
        })() : null);
        if (textInput !== null && textInput !== undefined) {
          let sorted = textInput.split('\n');
          if (numeric) {
            sorted.sort((a, b) => parseFloat(a) - parseFloat(b));
          } else {
            sorted.sort();
          }
          if (reverse) sorted.reverse();
          if (unique) sorted = [...new Set(sorted)];
          sorted.forEach(l => lines.push(mkLine('output', l)));
        } else if (pipeInput === null && !cmdArgs.filter(a => !a.startsWith('-'))[0]) {
          lines.push(mkLine('error', 'sort: missing operand'));
        }
        break;
      }

      case 'uniq': {
        const textInput = pipeInput ?? (cmdArgs[0] ? await (async () => {
          const fp = resolveRelativePath(session.cwd, cmdArgs[0]).replace(/\/$/, '');
          if (!(await fileExists(fp))) { lines.push(mkLine('error', `uniq: ${cmdArgs[0]}: No such file`)); return null; }
          return await FileSystem.readAsStringAsync(fp);
        })() : null);
        if (textInput !== null && textInput !== undefined) {
          const countFlag = cmdArgs.includes('-c');
          const inputLines = textInput.split('\n');
          const result: { line: string; count: number }[] = [];
          let prev = '';
          for (const l of inputLines) {
            if (l === prev && result.length > 0) {
              result[result.length - 1].count++;
            } else {
              result.push({ line: l, count: 1 });
              prev = l;
            }
          }
          result.forEach(r => {
            lines.push(mkLine('output', countFlag ? `${r.count.toString().padStart(7)} ${r.line}` : r.line));
          });
        } else if (pipeInput === null && !cmdArgs[0]) {
          lines.push(mkLine('error', 'uniq: missing operand'));
        }
        break;
      }

      case 'tr': {
        if (cmdArgs.length < 2) {
          lines.push(mkLine('error', 'tr: Usage: tr <from> <to>'));
          break;
        }
        const from = cmdArgs[0];
        const to = cmdArgs[1];
        const textInput = pipeInput || '';
        let result = textInput;
        if (from === '[:upper:]' && to === '[:lower:]') {
          result = textInput.toLowerCase();
        } else if (from === '[:lower:]' && to === '[:upper:]') {
          result = textInput.toUpperCase();
        } else {
          for (let i = 0; i < from.length && i < to.length; i++) {
            result = result.split(from[i]).join(to[i]);
          }
        }
        result.split('\n').forEach(l => lines.push(mkLine('output', l)));
        break;
      }

      case 'cut': {
        let delimiter = '\t';
        let fieldStr = '';
        let fileName = '';
        for (let i = 0; i < cmdArgs.length; i++) {
          if (cmdArgs[i].startsWith('-d')) {
            delimiter = cmdArgs[i].slice(2) || (cmdArgs[++i] || '\t');
          } else if (cmdArgs[i].startsWith('-f')) {
            fieldStr = cmdArgs[i].slice(2) || (cmdArgs[++i] || '');
          } else if (!cmdArgs[i].startsWith('-')) {
            fileName = cmdArgs[i];
          }
        }
        if (!fieldStr) {
          lines.push(mkLine('error', 'cut: missing field number (-f)'));
          break;
        }
        const fields = fieldStr.split(',').map(f => parseInt(f, 10) - 1);
        const textInput = pipeInput ?? (fileName ? await (async () => {
          const fp = resolveRelativePath(session.cwd, fileName).replace(/\/$/, '');
          if (!(await fileExists(fp))) { lines.push(mkLine('error', `cut: ${fileName}: No such file`)); return null; }
          return await FileSystem.readAsStringAsync(fp);
        })() : null);
        if (textInput !== null && textInput !== undefined) {
          textInput.split('\n').forEach(line => {
            const parts = line.split(delimiter);
            lines.push(mkLine('output', fields.map(f => parts[f] ?? '').join(delimiter)));
          });
        }
        break;
      }

      case 'tee': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'tee: missing file operand'));
          break;
        }
        const filePath = resolveRelativePath(session.cwd, cmdArgs[0]).replace(/\/$/, '');
        const text = pipeInput || '';
        const appendFlag = cmdArgs.includes('-a');
        if (appendFlag) {
          let existing = '';
          try { existing = await FileSystem.readAsStringAsync(filePath); } catch {}
          await FileSystem.writeAsStringAsync(filePath, existing + text);
        } else {
          await FileSystem.writeAsStringAsync(filePath, text);
        }
        text.split('\n').forEach(l => lines.push(mkLine('output', l)));
        break;
      }

      case 'rev': {
        const textInput = pipeInput ?? (cmdArgs[0] ? await (async () => {
          const fp = resolveRelativePath(session.cwd, cmdArgs[0]).replace(/\/$/, '');
          if (!(await fileExists(fp))) { lines.push(mkLine('error', `rev: ${cmdArgs[0]}: No such file`)); return null; }
          return await FileSystem.readAsStringAsync(fp);
        })() : null);
        if (textInput !== null && textInput !== undefined) {
          textInput.split('\n').forEach(l => lines.push(mkLine('output', l.split('').reverse().join(''))));
        } else if (pipeInput === null && !cmdArgs[0]) {
          lines.push(mkLine('error', 'rev: missing operand'));
        }
        break;
      }

      case 'fold': {
        let width = 80;
        let fileName = '';
        for (let i = 0; i < cmdArgs.length; i++) {
          if (cmdArgs[i] === '-w' && cmdArgs[i + 1]) {
            width = parseInt(cmdArgs[++i], 10);
          } else if (!cmdArgs[i].startsWith('-')) {
            fileName = cmdArgs[i];
          }
        }
        const textInput = pipeInput ?? (fileName ? await (async () => {
          const fp = resolveRelativePath(session.cwd, fileName).replace(/\/$/, '');
          if (!(await fileExists(fp))) { lines.push(mkLine('error', `fold: ${fileName}: No such file`)); return null; }
          return await FileSystem.readAsStringAsync(fp);
        })() : null);
        if (textInput !== null && textInput !== undefined) {
          textInput.split('\n').forEach(line => {
            for (let i = 0; i < line.length; i += width) {
              lines.push(mkLine('output', line.slice(i, i + width)));
            }
            if (line.length === 0) lines.push(mkLine('output', ''));
          });
        } else if (pipeInput === null && !fileName) {
          lines.push(mkLine('error', 'fold: missing operand'));
        }
        break;
      }

      case 'nl': {
        const textInput = pipeInput ?? (cmdArgs[0] ? await (async () => {
          const fp = resolveRelativePath(session.cwd, cmdArgs[0]).replace(/\/$/, '');
          if (!(await fileExists(fp))) { lines.push(mkLine('error', `nl: ${cmdArgs[0]}: No such file`)); return null; }
          return await FileSystem.readAsStringAsync(fp);
        })() : null);
        if (textInput !== null && textInput !== undefined) {
          let num = 1;
          textInput.split('\n').forEach(line => {
            if (line.trim()) {
              lines.push(mkLine('output', `${num.toString().padStart(6)}\t${line}`));
              num++;
            } else {
              lines.push(mkLine('output', ''));
            }
          });
        } else if (pipeInput === null && !cmdArgs[0]) {
          lines.push(mkLine('error', 'nl: missing operand'));
        }
        break;
      }

      case 'diff': {
        if (cmdArgs.length < 2) {
          lines.push(mkLine('error', 'diff: Usage: diff <file1> <file2>'));
          break;
        }
        const fp1 = resolveRelativePath(session.cwd, cmdArgs[0]).replace(/\/$/, '');
        const fp2 = resolveRelativePath(session.cwd, cmdArgs[1]).replace(/\/$/, '');
        if (!(await fileExists(fp1))) { lines.push(mkLine('error', `diff: ${cmdArgs[0]}: No such file`)); break; }
        if (!(await fileExists(fp2))) { lines.push(mkLine('error', `diff: ${cmdArgs[1]}: No such file`)); break; }
        const c1 = (await FileSystem.readAsStringAsync(fp1)).split('\n');
        const c2 = (await FileSystem.readAsStringAsync(fp2)).split('\n');
        let hasDiff = false;
        const maxLen = Math.max(c1.length, c2.length);
        for (let i = 0; i < maxLen; i++) {
          if (c1[i] !== c2[i]) {
            hasDiff = true;
            if (c1[i] !== undefined) lines.push(mkLine('error', `< ${i + 1}: ${c1[i]}`));
            if (c2[i] !== undefined) lines.push(mkLine('success', `> ${i + 1}: ${c2[i]}`));
          }
        }
        if (!hasDiff) {
          lines.push(mkLine('output', 'Files are identical'));
        }
        break;
      }

      case 'du': {
        const target = cmdArgs[0] ? resolveRelativePath(session.cwd, cmdArgs[0]) : session.cwd;
        try {
          const info = await FileSystem.getInfoAsync(target);
          const size = info.exists ? info.size : 0;
          lines.push(mkLine('output', `${formatSize(size).padStart(8)}  ${getDisplayPath(target)}`));
        } catch {
          lines.push(mkLine('error', `du: cannot access '${cmdArgs[0] || '.'}'`));
        }
        break;
      }

      case 'df': {
        try {
          const freeSpace = await FileSystem.getFreeDiskStorageAsync();
          const totalSpace = await FileSystem.getTotalDiskCapacityAsync();
          const usedSpace = totalSpace - freeSpace;
          const usedPct = totalSpace > 0 ? Math.round((usedSpace / totalSpace) * 100) : 0;
          lines.push(mkLine('output', 'Filesystem      Size    Used   Avail  Use%'));
          lines.push(mkLine('output', `/dev/root   ${formatSize(totalSpace).padStart(8)} ${formatSize(usedSpace).padStart(7)} ${formatSize(freeSpace).padStart(7)}  ${usedPct}%`));
        } catch {
          lines.push(mkLine('warning', 'df: filesystem info not available on this platform'));
        }
        break;
      }

      case 'stat': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'stat: missing operand'));
          break;
        }
        const target = resolveRelativePath(session.cwd, cmdArgs[0]).replace(/\/$/, '');
        try {
          const info = await FileSystem.getInfoAsync(target);
          if (!info.exists) {
            lines.push(mkLine('error', `stat: ${cmdArgs[0]}: No such file or directory`));
            break;
          }
          lines.push(mkLine('output', `  File: ${cmdArgs[0]}`));
          lines.push(mkLine('output', `  Size: ${info.size || 0}`));
          lines.push(mkLine('output', `  Type: ${info.isDirectory ? 'directory' : 'regular file'}`));
          if (info.modificationTime) {
            lines.push(mkLine('output', `  Modified: ${new Date(info.modificationTime * 1000).toISOString()}`));
          }
          lines.push(mkLine('output', `  URI: ${info.uri}`));
        } catch (e: any) {
          lines.push(mkLine('error', `stat: ${e.message}`));
        }
        break;
      }

      case 'file': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'file: missing operand'));
          break;
        }
        const target = resolveRelativePath(session.cwd, cmdArgs[0]).replace(/\/$/, '');
        const info = await FileSystem.getInfoAsync(target);
        if (!info.exists) {
          lines.push(mkLine('error', `file: ${cmdArgs[0]}: No such file or directory`));
          break;
        }
        if (info.isDirectory) {
          lines.push(mkLine('output', `${cmdArgs[0]}: directory`));
        } else {
          const ext = cmdArgs[0].split('.').pop()?.toLowerCase() || '';
          const types: Record<string, string> = {
            txt: 'ASCII text', js: 'JavaScript source', ts: 'TypeScript source',
            json: 'JSON data', html: 'HTML document', css: 'CSS stylesheet',
            md: 'Markdown text', py: 'Python script', sh: 'Shell script',
            xml: 'XML document', csv: 'CSV data', yaml: 'YAML data', yml: 'YAML data',
            png: 'PNG image data', jpg: 'JPEG image data', jpeg: 'JPEG image data',
            gif: 'GIF image data', svg: 'SVG image', pdf: 'PDF document',
            mp3: 'MPEG audio', mp4: 'MPEG-4 video', zip: 'Zip archive',
          };
          lines.push(mkLine('output', `${cmdArgs[0]}: ${types[ext] || 'data'}`));
        }
        break;
      }

      case 'basename': {
        if (!cmdArgs[0]) { lines.push(mkLine('error', 'basename: missing operand')); break; }
        const p = cmdArgs[0].replace(/\/$/, '');
        const name = p.split('/').pop() || p;
        const suffix = cmdArgs[1];
        lines.push(mkLine('output', suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name));
        break;
      }

      case 'dirname': {
        if (!cmdArgs[0]) { lines.push(mkLine('error', 'dirname: missing operand')); break; }
        const p = cmdArgs[0].replace(/\/$/, '');
        const parts = p.split('/');
        parts.pop();
        lines.push(mkLine('output', parts.join('/') || '.'));
        break;
      }

      case 'realpath':
      case 'readlink': {
        if (!cmdArgs[0]) { lines.push(mkLine('error', `${cmd}: missing operand`)); break; }
        const resolved = resolveRelativePath(session.cwd, cmdArgs[0]);
        lines.push(mkLine('output', getDisplayPath(resolved)));
        break;
      }

      case 'date': {
        const now = new Date();
        if (cmdArgs[0] === '-u' || cmdArgs[0] === '--utc') {
          lines.push(mkLine('output', now.toUTCString()));
        } else if (cmdArgs[0] === '-I' || cmdArgs[0] === '--iso') {
          lines.push(mkLine('output', now.toISOString()));
        } else if (cmdArgs[0] === '+%s') {
          lines.push(mkLine('output', Math.floor(now.getTime() / 1000).toString()));
        } else {
          lines.push(mkLine('output', now.toString()));
        }
        break;
      }

      case 'whoami':
        lines.push(mkLine('output', newEnv.USER || 'mobile'));
        break;

      case 'id':
        lines.push(mkLine('output', `uid=1000(${newEnv.USER || 'mobile'}) gid=1000(${newEnv.USER || 'mobile'}) groups=1000(${newEnv.USER || 'mobile'})`));
        break;

      case 'hostname':
        lines.push(mkLine('output', newEnv.HOSTNAME || 'edenmux'));
        break;

      case 'w': {
        lines.push(mkLine('output', ` ${new Date().toLocaleTimeString()} up ${(() => {
          const d = Date.now() - session.createdAt;
          const m = Math.floor(d / 60000);
          return m < 60 ? `${m} min` : `${Math.floor(m / 60)}:${(m % 60).toString().padStart(2, '0')}`;
        })()},  1 user`));
        lines.push(mkLine('output', 'USER     TTY      FROM             IDLE'));
        lines.push(mkLine('output', `${(newEnv.USER || 'mobile').padEnd(9)}pts/0    localhost        0.00s`));
        break;
      }

      case 'uname': {
        const flag = cmdArgs[0] || '-a';
        if (flag === '-a' || flag === '--all') {
          lines.push(mkLine('output', `EdenMux ${Platform.OS} ${Platform.Version || ''} armv8l EdenMux/1.0`));
        } else if (flag === '-s' || flag === '--kernel-name') {
          lines.push(mkLine('output', 'EdenMux'));
        } else if (flag === '-r' || flag === '--kernel-release') {
          lines.push(mkLine('output', `${Platform.Version || '1.0'}`));
        } else if (flag === '-m' || flag === '--machine') {
          lines.push(mkLine('output', 'armv8l'));
        } else if (flag === '-n' || flag === '--nodename') {
          lines.push(mkLine('output', newEnv.HOSTNAME || 'edenmux'));
        } else if (flag === '-o' || flag === '--operating-system') {
          lines.push(mkLine('output', Platform.OS === 'ios' ? 'iOS' : Platform.OS));
        } else {
          lines.push(mkLine('output', `EdenMux ${Platform.OS}`));
        }
        break;
      }

      case 'uptime': {
        const now = Date.now();
        const diff = now - session.createdAt;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        let upStr = '';
        if (days > 0) upStr += `${days}d `;
        if (hours % 24 > 0) upStr += `${hours % 24}h `;
        upStr += `${minutes % 60}m ${seconds % 60}s`;
        lines.push(mkLine('output', ` ${new Date().toLocaleTimeString()} up ${upStr.trim()},  1 user`));
        break;
      }

      case 'env':
      case 'printenv': {
        const specificVar = cmdArgs[0];
        if (specificVar) {
          if (newEnv[specificVar] !== undefined) {
            lines.push(mkLine('output', newEnv[specificVar]));
          }
        } else {
          Object.entries(newEnv).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => {
            lines.push(mkLine('output', `${k}=${v}`));
          });
        }
        break;
      }

      case 'export': {
        const assignment = cmdArgs.join(' ');
        const eqIdx = assignment.indexOf('=');
        if (eqIdx === -1) {
          lines.push(mkLine('error', 'export: Usage: export KEY=VALUE'));
          break;
        }
        const key = assignment.slice(0, eqIdx).trim();
        const value = assignment.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        newEnv[key] = value;
        break;
      }

      case 'unset': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'unset: missing variable name'));
          break;
        }
        delete newEnv[cmdArgs[0]];
        break;
      }

      case 'set': {
        Object.entries(newEnv).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => {
          lines.push(mkLine('output', `${k}=${v}`));
        });
        if (Object.keys(newAliases).length > 0) {
          lines.push(mkLine('output', ''));
          Object.entries(newAliases).forEach(([k, v]) => {
            lines.push(mkLine('output', `alias ${k}='${v}'`));
          });
        }
        break;
      }

      case 'alias': {
        if (cmdArgs.length === 0) {
          if (Object.keys(newAliases).length === 0) {
            lines.push(mkLine('output', '(no aliases defined)'));
          } else {
            Object.entries(newAliases).forEach(([k, v]) => {
              lines.push(mkLine('output', `alias ${k}='${v}'`));
            });
          }
          break;
        }
        const aliasStr = cmdArgs.join(' ');
        const eqIdx = aliasStr.indexOf('=');
        if (eqIdx === -1) {
          if (newAliases[cmdArgs[0]]) {
            lines.push(mkLine('output', `alias ${cmdArgs[0]}='${newAliases[cmdArgs[0]]}'`));
          } else {
            lines.push(mkLine('error', `alias: ${cmdArgs[0]}: not found`));
          }
          break;
        }
        const name = aliasStr.slice(0, eqIdx).trim();
        const value = aliasStr.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        newAliases[name] = value;
        break;
      }

      case 'unalias': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'unalias: missing argument'));
          break;
        }
        if (cmdArgs[0] === '-a') {
          newAliases = {};
        } else {
          delete newAliases[cmdArgs[0]];
        }
        break;
      }

      case 'type': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'type: missing argument'));
          break;
        }
        const target = cmdArgs[0];
        if (newAliases[target]) {
          lines.push(mkLine('output', `${target} is aliased to '${newAliases[target]}'`));
        } else if (ALL_COMMANDS.includes(target)) {
          lines.push(mkLine('output', `${target} is a shell builtin`));
        } else {
          lines.push(mkLine('error', `type: ${target}: not found`));
        }
        break;
      }

      case 'which': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', 'which: missing command name'));
          break;
        }
        if (ALL_COMMANDS.includes(cmdArgs[0])) {
          lines.push(mkLine('output', `${cmdArgs[0]}: shell built-in command`));
        } else {
          lines.push(mkLine('error', `${cmdArgs[0]}: not found`));
        }
        break;
      }

      case 'history': {
        if (cmdArgs[0] === '-c') {
          lines.push(mkLine('system', '__CLEAR_HISTORY__'));
          break;
        }
        if (session.history.length === 0) {
          lines.push(mkLine('output', '(no history)'));
        } else {
          const count = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : session.history.length;
          session.history.slice(-count).forEach((h, i) => {
            lines.push(mkLine('output', `  ${(i + 1).toString().padStart(4)}  ${h}`));
          });
        }
        break;
      }

      case 'copy': {
        const text = cmdArgs.join(' ') || pipeInput || '';
        if (!text) {
          lines.push(mkLine('error', 'copy: nothing to copy'));
          break;
        }
        try {
          await Clipboard.setStringAsync(text);
          lines.push(mkLine('success', 'Copied to clipboard'));
        } catch {
          lines.push(mkLine('error', 'Failed to copy to clipboard'));
        }
        break;
      }

      case 'paste': {
        try {
          const text = await Clipboard.getStringAsync();
          if (text) {
            text.split('\n').forEach(l => lines.push(mkLine('output', l)));
          } else {
            lines.push(mkLine('output', '(clipboard empty)'));
          }
        } catch {
          lines.push(mkLine('error', 'Failed to read clipboard'));
        }
        break;
      }

      case 'js':
      case 'eval':
      case 'node': {
        lines.push(mkLine('warning', `${cmd}: not available in EdenMux`));
        lines.push(mkLine('info', 'JavaScript execution was removed to comply with Apple App Store rules.'));
        lines.push(mkLine('info', "Apple requires that apps don't run code that wasn't reviewed by them."));
        lines.push(mkLine('info', 'Ask Eden (the AI in the upper right) if you want to know more.'));
        break;
      }

      case 'calc': {
        const expr = cmdArgs.join(' ');
        if (!expr) {
          lines.push(mkLine('error', 'calc: missing expression'));
          break;
        }
        try {
          const sanitized = expr.replace(/[^0-9+\-*/().%\s^]/g, '');
          const result = evalMath(sanitized);
          lines.push(mkLine('success', `= ${result}`));
        } catch {
          lines.push(mkLine('error', `calc: invalid expression: ${expr}`));
        }
        break;
      }

      case 'base64': {
        if (cmdArgs[0] === '-d' || cmdArgs[0] === '--decode') {
          const text = cmdArgs.slice(1).join(' ') || pipeInput || '';
          if (!text) { lines.push(mkLine('error', 'base64: missing input')); break; }
          try {
            lines.push(mkLine('output', atob(text.trim())));
          } catch {
            lines.push(mkLine('error', 'base64: invalid base64 input'));
          }
        } else {
          const text = cmdArgs.join(' ') || pipeInput || '';
          if (!text) { lines.push(mkLine('error', 'base64: missing text')); break; }
          lines.push(mkLine('output', btoa(text)));
        }
        break;
      }

      case 'hex': {
        const text = cmdArgs.join(' ') || pipeInput || '';
        if (!text) {
          lines.push(mkLine('error', 'hex: missing text'));
          break;
        }
        const hex = Array.from(text).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
        lines.push(mkLine('output', hex));
        break;
      }

      case 'md5sum':
      case 'sha256sum': {
        if (!cmdArgs[0]) {
          lines.push(mkLine('error', `${cmd}: missing operand`));
          break;
        }
        const filePath = resolveRelativePath(session.cwd, cmdArgs[0]).replace(/\/$/, '');
        if (!(await fileExists(filePath))) {
          lines.push(mkLine('error', `${cmd}: ${cmdArgs[0]}: No such file`));
          break;
        }
        const content = await FileSystem.readAsStringAsync(filePath);
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
          const chr = content.charCodeAt(i);
          hash = ((hash << 5) - hash) + chr;
          hash |= 0;
        }
        const hexHash = Math.abs(hash).toString(16).padStart(cmd === 'sha256sum' ? 64 : 32, '0');
        lines.push(mkLine('output', `${hexHash}  ${cmdArgs[0]}`));
        break;
      }

      case 'seq': {
        let start = 1, end = 1, step = 1;
        if (cmdArgs.length === 1) {
          end = parseInt(cmdArgs[0], 10);
        } else if (cmdArgs.length === 2) {
          start = parseInt(cmdArgs[0], 10);
          end = parseInt(cmdArgs[1], 10);
        } else if (cmdArgs.length >= 3) {
          start = parseInt(cmdArgs[0], 10);
          step = parseInt(cmdArgs[1], 10);
          end = parseInt(cmdArgs[2], 10);
        }
        if (step === 0) { lines.push(mkLine('error', 'seq: step cannot be zero')); break; }
        const maxIter = 1000;
        let count = 0;
        if (step > 0) {
          for (let i = start; i <= end && count < maxIter; i += step, count++) {
            lines.push(mkLine('output', i.toString()));
          }
        } else {
          for (let i = start; i >= end && count < maxIter; i += step, count++) {
            lines.push(mkLine('output', i.toString()));
          }
        }
        break;
      }

      case 'yes': {
        const text = cmdArgs.join(' ') || 'y';
        for (let i = 0; i < 20; i++) {
          lines.push(mkLine('output', text));
        }
        lines.push(mkLine('info', '(truncated at 20 lines)'));
        break;
      }

      case 'sleep': {
        const secs = parseFloat(cmdArgs[0] || '1');
        if (isNaN(secs) || secs < 0) {
          lines.push(mkLine('error', 'sleep: invalid time interval'));
          break;
        }
        const ms = Math.min(secs * 1000, 10000);
        await new Promise(resolve => setTimeout(resolve, ms));
        break;
      }

      case 'true':
        break;

      case 'false':
        lines.push(mkLine('error', ''));
        break;

      case 'test': {
        if (cmdArgs.length === 0) { break; }
        const op = cmdArgs.length === 3 ? cmdArgs[1] : cmdArgs[0];
        if (cmdArgs[0] === '-f') {
          const fp = resolveRelativePath(session.cwd, cmdArgs[1] || '').replace(/\/$/, '');
          if (await fileExists(fp)) { lines.push(mkLine('output', '0')); } else { lines.push(mkLine('output', '1')); }
        } else if (cmdArgs[0] === '-d') {
          const dp = resolveRelativePath(session.cwd, cmdArgs[1] || '');
          if (await isDirectory(dp)) { lines.push(mkLine('output', '0')); } else { lines.push(mkLine('output', '1')); }
        } else if (cmdArgs[0] === '-z') {
          lines.push(mkLine('output', (cmdArgs[1] || '').length === 0 ? '0' : '1'));
        } else if (cmdArgs[0] === '-n') {
          lines.push(mkLine('output', (cmdArgs[1] || '').length > 0 ? '0' : '1'));
        } else if (op === '=' || op === '==') {
          lines.push(mkLine('output', cmdArgs[0] === cmdArgs[2] ? '0' : '1'));
        } else if (op === '!=') {
          lines.push(mkLine('output', cmdArgs[0] !== cmdArgs[2] ? '0' : '1'));
        } else {
          lines.push(mkLine('output', cmdArgs[0] ? '0' : '1'));
        }
        break;
      }

      case 'xargs': {
        if (!cmdArgs[0] || pipeInput === null) {
          lines.push(mkLine('error', 'xargs: Usage: <command> | xargs <command>'));
          break;
        }
        const xargsCmd = cmdArgs.join(' ');
        const xargsInput = pipeInput.split('\n').filter(Boolean).join(' ');
        const subResult = await executeCommand(`${xargsCmd} ${xargsInput}`, session);
        lines.push(...subResult.lines);
        break;
      }

      case 'motd': {
        try {
          const motdPath = BASE_DIR + '.config/motd';
          if (await fileExists(motdPath)) {
            const content = await FileSystem.readAsStringAsync(motdPath);
            content.split('\n').forEach(l => lines.push(mkLine('info', l)));
          } else {
            MOTD.split('\n').forEach(l => lines.push(mkLine('info', l)));
          }
        } catch {
          MOTD.split('\n').forEach(l => lines.push(mkLine('info', l)));
        }
        break;
      }

      case 'cowsay': {
        const text = cmdArgs.join(' ') || 'moo';
        const maxWidth = 40;
        const words = text.split(' ');
        const wrappedLines: string[] = [];
        let currentLine = '';
        for (const word of words) {
          if (currentLine && (currentLine + ' ' + word).length > maxWidth) {
            wrappedLines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = currentLine ? currentLine + ' ' + word : word;
          }
        }
        if (currentLine) wrappedLines.push(currentLine);

        const longestLine = Math.max(...wrappedLines.map(l => l.length));
        const border = '-'.repeat(longestLine + 2);
        lines.push(mkLine('output', ` ${border}`));
        if (wrappedLines.length === 1) {
          lines.push(mkLine('output', `< ${wrappedLines[0].padEnd(longestLine)} >`));
        } else {
          wrappedLines.forEach((l, i) => {
            if (i === 0) lines.push(mkLine('output', `/ ${l.padEnd(longestLine)} \\`));
            else if (i === wrappedLines.length - 1) lines.push(mkLine('output', `\\ ${l.padEnd(longestLine)} /`));
            else lines.push(mkLine('output', `| ${l.padEnd(longestLine)} |`));
          });
        }
        lines.push(mkLine('output', ` ${border}`));
        lines.push(mkLine('output', '        \\   ^__^'));
        lines.push(mkLine('output', '         \\  (oo)\\_______'));
        lines.push(mkLine('output', '            (__)\\       )\\/\\'));
        lines.push(mkLine('output', '                ||----w |'));
        lines.push(mkLine('output', '                ||     ||'));
        break;
      }

      case 'sl': {
        if (!session.installedPackages['sl']) {
          lines.push(mkLine('error', 'sl: command not found'));
          lines.push(mkLine('warning', 'Install it first: pkg install sl'));
          break;
        }
        const train = [
          '      ====        ________                ___________    ',
          '  _D _|  |_______/        \\__I_I_____===__|___________|  ',
          '   |(_)---  |   H\\________/ |   |        =|___ ___|      ',
          '   /     |  |   H  |  |     |   |         ||_| |_||      ',
          '  |      |  |   H  |__--------------------| [___] |      ',
          '  | ________|___H__/__|_____/[][]~\\_______|       |      ',
          '  |/ |   |-----------I_____I [][] []  D   |=======|      ',
          "__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__",
          " |/-=|___|=    ||    ||    ||    |_____/~\\___/        ",
          '  \\_/      \\O=====O=====O=====O_____/      \\_/        ',
        ];
        train.forEach(l => lines.push(mkLine('output', l)));
        lines.push(mkLine('info', '  🚂  Choo choo! SL (Steam Locomotive) v5.05'));
        break;
      }

      case 'fortune': {
        const fortunes = [
          'The best way to predict the future is to invent it.',
          'In the middle of difficulty lies opportunity.',
          'The only way to do great work is to love what you do.',
          'Code is like humor. When you have to explain it, it\'s bad.',
          'First, solve the problem. Then, write the code.',
          'Talk is cheap. Show me the code.',
          'Simplicity is the soul of efficiency.',
          'Any fool can write code that a computer can understand.',
          'It works on my machine.',
          'There are only two hard things: cache invalidation and naming things.',
          'sudo make me a sandwich.',
          'There is no place like 127.0.0.1.',
          'To err is human, to really foul things up requires root access.',
          'chmod 777 is never the answer.',
          'Have you tried turning it off and on again?',
          'The best code is no code at all.',
          'A good programmer looks both ways before crossing a one-way street.',
          'Software is like entropy: it is difficult to grasp, weighs nothing, and obeys the second law of thermodynamics.',
          'Weeks of coding can save you hours of planning.',
          'There are 10 types of people: those who understand binary and those who don\'t.',
        ];
        const idx = Math.floor(Math.random() * fortunes.length);
        lines.push(mkLine('info', fortunes[idx]));
        break;
      }

      case 'banner': {
        const text = (cmdArgs.join(' ') || 'HELLO').toUpperCase();
        const charMap: Record<string, string[]> = {
          'A': ['  #  ', ' # # ', '#####', '#   #', '#   #'],
          'B': ['#### ', '#   #', '#### ', '#   #', '#### '],
          'C': [' ####', '#    ', '#    ', '#    ', ' ####'],
          'D': ['#### ', '#   #', '#   #', '#   #', '#### '],
          'E': ['#####', '#    ', '#### ', '#    ', '#####'],
          'F': ['#####', '#    ', '#### ', '#    ', '#    '],
          'G': [' ####', '#    ', '# ###', '#   #', ' ####'],
          'H': ['#   #', '#   #', '#####', '#   #', '#   #'],
          'I': ['#####', '  #  ', '  #  ', '  #  ', '#####'],
          'J': ['#####', '   # ', '   # ', '#  # ', ' ##  '],
          'K': ['#   #', '#  # ', '###  ', '#  # ', '#   #'],
          'L': ['#    ', '#    ', '#    ', '#    ', '#####'],
          'M': ['#   #', '## ##', '# # #', '#   #', '#   #'],
          'N': ['#   #', '##  #', '# # #', '#  ##', '#   #'],
          'O': [' ### ', '#   #', '#   #', '#   #', ' ### '],
          'P': ['#### ', '#   #', '#### ', '#    ', '#    '],
          'Q': [' ### ', '#   #', '# # #', '#  # ', ' ## #'],
          'R': ['#### ', '#   #', '#### ', '#  # ', '#   #'],
          'S': [' ####', '#    ', ' ### ', '    #', '#### '],
          'T': ['#####', '  #  ', '  #  ', '  #  ', '  #  '],
          'U': ['#   #', '#   #', '#   #', '#   #', ' ### '],
          'V': ['#   #', '#   #', '#   #', ' # # ', '  #  '],
          'W': ['#   #', '#   #', '# # #', '## ##', '#   #'],
          'X': ['#   #', ' # # ', '  #  ', ' # # ', '#   #'],
          'Y': ['#   #', ' # # ', '  #  ', '  #  ', '  #  '],
          'Z': ['#####', '   # ', '  #  ', ' #   ', '#####'],
          '!': ['  #  ', '  #  ', '  #  ', '     ', '  #  '],
          ' ': ['     ', '     ', '     ', '     ', '     '],
        };
        for (let row = 0; row < 5; row++) {
          let line = '';
          for (const ch of text.slice(0, 20)) {
            const glyph = charMap[ch] || charMap[' '] || ['     ', '     ', '     ', '     ', '     '];
            line += glyph[row] + ' ';
          }
          lines.push(mkLine('output', line));
        }
        break;
      }

      case 'termux-setup-storage':
      case 'edenmux-setup-storage': {
        const storageDirs = [
          'storage/downloads',
          'storage/shared',
          'storage/dcim',
          'storage/music',
          'storage/pictures',
          'storage/movies',
          'storage/documents',
        ];
        lines.push(mkLine('info', 'Setting up storage directories...'));
        for (const dir of storageDirs) {
          const fullPath = BASE_DIR + dir;
          try {
            const info = await FileSystem.getInfoAsync(fullPath);
            if (!info.exists) {
              await FileSystem.makeDirectoryAsync(fullPath, { intermediates: true });
              lines.push(mkLine('output', `  Created ~/${dir}`));
            } else {
              lines.push(mkLine('output', `  ~/${dir} (already exists)`));
            }
          } catch {
            lines.push(mkLine('output', `  Created ~/${dir}`));
          }
        }
        lines.push(mkLine('success', 'Storage setup complete.'));
        lines.push(mkLine('info', 'Symlinks to shared storage have been created under ~/storage'));
        break;
      }

      case 'neofetch': {
        const pkgCount = Object.keys(newInstalledPackages).length;
        const now = Date.now();
        const uptimeDiff = now - session.createdAt;
        const uptimeMin = Math.floor(uptimeDiff / 60000);
        const uptimeStr = uptimeMin < 60 ? `${uptimeMin} mins` : `${Math.floor(uptimeMin / 60)} hours, ${uptimeMin % 60} mins`;
        const art = [
          '        ╭──────────╮',
          '        │  ╭────╮  │',
          '        │  │ >_ │  │',
          '        │  ╰────╯  │',
          '        │          │',
          '        ╰──────────╯',
        ];
        const info = [
          `${newEnv.USER || 'mobile'}@${newEnv.HOSTNAME || 'edenmux'}`,
          '──────────────────',
          `OS: EdenMux 1.0 ${Platform.OS}`,
          `Host: ${Platform.OS === 'ios' ? 'Apple iPhone' : Platform.OS}`,
          `Kernel: ${Platform.Version || '1.0'}`,
          `Uptime: ${uptimeStr}`,
          `Packages: ${pkgCount} (dpkg)`,
          `Shell: edenmux`,
          `Terminal: EdenMux v1.0`,
          `CPU: Apple Silicon`,
          `Memory: 6144MiB / 8192MiB`,
        ];
        const maxLines = Math.max(art.length, info.length);
        for (let i = 0; i < maxLines; i++) {
          const artLine = (art[i] || '').padEnd(24);
          const infoLine = info[i] || '';
          lines.push(mkLine(i < art.length ? 'info' : 'output', `${artLine} ${infoLine}`));
        }
        break;
      }

      case 'pkg': {
        const subCmd = cmdArgs[0];
        const pkgNames = cmdArgs.slice(1).filter(a => !a.startsWith('-'));

        if (!subCmd || subCmd === 'help' || subCmd === '--help') {
          lines.push(mkLine('info', 'Usage: pkg <command> [packages]'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('output', '  install      Install packages'));
          lines.push(mkLine('output', '  uninstall    Remove packages'));
          lines.push(mkLine('output', '  reinstall    Reinstall packages'));
          lines.push(mkLine('output', '  search       Search available packages'));
          lines.push(mkLine('output', '  show         Show package details'));
          lines.push(mkLine('output', '  list-all     List all available packages'));
          lines.push(mkLine('output', '  list-installed List installed packages'));
          lines.push(mkLine('output', '  update       Update package lists'));
          lines.push(mkLine('output', '  upgrade      Upgrade installed packages'));
          lines.push(mkLine('output', '  files        List files in a package'));
          break;
        }

        switch (subCmd) {
          case 'install': {
            if (pkgNames.length === 0) {
              lines.push(mkLine('error', 'pkg: no packages specified'));
              break;
            }
            for (const name of pkgNames) {
              if (newInstalledPackages[name]) {
                lines.push(mkLine('info', `${name} is already installed (${newInstalledPackages[name]})`));
                continue;
              }
              const pkg = PACKAGE_REGISTRY[name];
              if (!pkg) {
                lines.push(mkLine('error', `E: Unable to locate package ${name}`));
                continue;
              }
              lines.push(mkLine('output', `Selecting previously unselected package ${name}.`));
              if (pkg.depends) {
                for (const dep of pkg.depends) {
                  if (!newInstalledPackages[dep] && PACKAGE_REGISTRY[dep]) {
                    lines.push(mkLine('output', `  Installing dependency: ${dep} (${PACKAGE_REGISTRY[dep].version})`));
                    newInstalledPackages[dep] = PACKAGE_REGISTRY[dep].version;
                  }
                }
              }
              lines.push(mkLine('output', `Unpacking ${name} (${pkg.version}) ...`));
              lines.push(mkLine('output', `Setting up ${name} (${pkg.version}) ...`));
              newInstalledPackages[name] = pkg.version;
              lines.push(mkLine('success', `${name} ${pkg.version} installed successfully`));
            }
            await delay(300);
            break;
          }

          case 'uninstall':
          case 'remove': {
            if (pkgNames.length === 0) {
              lines.push(mkLine('error', 'pkg: no packages specified'));
              break;
            }
            for (const name of pkgNames) {
              if (!newInstalledPackages[name]) {
                lines.push(mkLine('error', `Package '${name}' is not installed`));
                continue;
              }
              const protectedPkgs = ['apt', 'dpkg', 'bash', 'coreutils', 'busybox', 'edenmux-tools'];
              if (protectedPkgs.includes(name)) {
                lines.push(mkLine('error', `E: Refusing to remove essential package: ${name}`));
                continue;
              }
              lines.push(mkLine('output', `Removing ${name} (${newInstalledPackages[name]}) ...`));
              delete newInstalledPackages[name];
              lines.push(mkLine('success', `${name} removed`));
            }
            await delay(200);
            break;
          }

          case 'reinstall': {
            if (pkgNames.length === 0) {
              lines.push(mkLine('error', 'pkg: no packages specified'));
              break;
            }
            for (const name of pkgNames) {
              const pkg = PACKAGE_REGISTRY[name];
              if (!pkg) {
                lines.push(mkLine('error', `E: Unable to locate package ${name}`));
                continue;
              }
              lines.push(mkLine('output', `Reinstalling ${name} (${pkg.version}) ...`));
              newInstalledPackages[name] = pkg.version;
              lines.push(mkLine('success', `${name} ${pkg.version} reinstalled`));
            }
            await delay(200);
            break;
          }

          case 'search': {
            const query = (pkgNames[0] || '').toLowerCase();
            if (!query) {
              lines.push(mkLine('error', 'pkg: search term required'));
              break;
            }
            let found = 0;
            for (const [name, pkg] of Object.entries(PACKAGE_REGISTRY).sort(([a], [b]) => a.localeCompare(b))) {
              if (name.includes(query) || pkg.description.toLowerCase().includes(query)) {
                const installed = newInstalledPackages[name] ? ' [installed]' : '';
                lines.push(mkLine('output', `${name}/${pkg.version} - ${pkg.description}${installed}`));
                found++;
              }
            }
            if (found === 0) {
              lines.push(mkLine('output', `No packages found matching '${query}'`));
            } else {
              lines.push(mkLine('info', `${found} package(s) found`));
            }
            break;
          }

          case 'show': {
            if (!pkgNames[0]) {
              lines.push(mkLine('error', 'pkg: package name required'));
              break;
            }
            const pkg = PACKAGE_REGISTRY[pkgNames[0]];
            if (!pkg) {
              lines.push(mkLine('error', `E: No packages found matching ${pkgNames[0]}`));
              break;
            }
            const isInst = newInstalledPackages[pkgNames[0]];
            lines.push(mkLine('output', `Package: ${pkgNames[0]}`));
            lines.push(mkLine('output', `Version: ${pkg.version}`));
            lines.push(mkLine('output', `Description: ${pkg.description}`));
            lines.push(mkLine('output', `Section: ${pkg.section}`));
            lines.push(mkLine('output', `Installed-Size: ${pkg.size}`));
            lines.push(mkLine('output', `Status: ${isInst ? 'installed' : 'not installed'}`));
            if (pkg.depends) {
              lines.push(mkLine('output', `Depends: ${pkg.depends.join(', ')}`));
            }
            break;
          }

          case 'list-all': {
            const sorted = Object.entries(PACKAGE_REGISTRY).sort(([a], [b]) => a.localeCompare(b));
            for (const [name, pkg] of sorted) {
              const installed = newInstalledPackages[name] ? ' [installed]' : '';
              lines.push(mkLine('output', `${name}/${pkg.version}${installed}`));
            }
            lines.push(mkLine('info', `${sorted.length} packages available`));
            break;
          }

          case 'list-installed': {
            const sorted = Object.entries(newInstalledPackages).sort(([a], [b]) => a.localeCompare(b));
            for (const [name, ver] of sorted) {
              const desc = PACKAGE_REGISTRY[name]?.description || '';
              lines.push(mkLine('output', `${name} ${ver}  ${desc}`));
            }
            lines.push(mkLine('info', `${sorted.length} packages installed`));
            break;
          }

          case 'update': {
            lines.push(mkLine('output', 'Hit:1 https://packages.edenmux.dev stable InRelease'));
            lines.push(mkLine('output', 'Hit:2 https://packages.edenmux.dev stable-games InRelease'));
            lines.push(mkLine('output', 'Hit:3 https://packages.edenmux.dev stable-science InRelease'));
            await delay(300);
            lines.push(mkLine('output', `Reading package lists... Done`));
            lines.push(mkLine('output', `Building dependency tree... Done`));
            lines.push(mkLine('success', `All packages are up to date.`));
            break;
          }

          case 'upgrade': {
            lines.push(mkLine('output', 'Reading package lists... Done'));
            lines.push(mkLine('output', 'Building dependency tree... Done'));
            lines.push(mkLine('output', 'Calculating upgrade... Done'));
            await delay(300);
            lines.push(mkLine('success', '0 upgraded, 0 newly installed, 0 to remove.'));
            break;
          }

          case 'files': {
            if (!pkgNames[0]) {
              lines.push(mkLine('error', 'pkg: package name required'));
              break;
            }
            if (!newInstalledPackages[pkgNames[0]]) {
              lines.push(mkLine('error', `Package '${pkgNames[0]}' is not installed`));
              break;
            }
            const pkg = PACKAGE_REGISTRY[pkgNames[0]];
            if (pkg) {
              lines.push(mkLine('output', `/data/data/com.edenmux/files/usr/bin/${pkgNames[0]}`));
              lines.push(mkLine('output', `/data/data/com.edenmux/files/usr/lib/${pkgNames[0]}/`));
              lines.push(mkLine('output', `/data/data/com.edenmux/files/usr/share/${pkgNames[0]}/`));
              lines.push(mkLine('output', `/data/data/com.edenmux/files/usr/share/doc/${pkgNames[0]}/`));
              lines.push(mkLine('output', `/data/data/com.edenmux/files/usr/share/man/man1/${pkgNames[0]}.1.gz`));
            }
            break;
          }

          default:
            lines.push(mkLine('error', `pkg: unknown command '${subCmd}'`));
            lines.push(mkLine('info', 'Run "pkg help" for usage'));
        }
        break;
      }

      case 'apt':
      case 'apt-get': {
        const subCmd = cmdArgs[0];
        const pkgNames = cmdArgs.slice(1).filter(a => !a.startsWith('-'));
        const hasYes = cmdArgs.includes('-y') || cmdArgs.includes('--yes');

        if (!subCmd || subCmd === 'help' || subCmd === '--help') {
          lines.push(mkLine('info', `apt ${cmd === 'apt-get' ? '(apt-get) ' : ''}- package manager`));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('output', '  apt install <pkg>     Install packages'));
          lines.push(mkLine('output', '  apt remove <pkg>      Remove packages'));
          lines.push(mkLine('output', '  apt purge <pkg>       Remove packages and config'));
          lines.push(mkLine('output', '  apt update            Update package index'));
          lines.push(mkLine('output', '  apt upgrade           Upgrade installed packages'));
          lines.push(mkLine('output', '  apt full-upgrade      Full system upgrade'));
          lines.push(mkLine('output', '  apt search <term>     Search packages'));
          lines.push(mkLine('output', '  apt show <pkg>        Show package details'));
          lines.push(mkLine('output', '  apt list              List packages'));
          lines.push(mkLine('output', '  apt autoremove        Remove unused dependencies'));
          break;
        }

        switch (subCmd) {
          case 'install': {
            if (pkgNames.length === 0) {
              lines.push(mkLine('error', 'E: No packages specified'));
              break;
            }
            const toInstall: { name: string; pkg: PackageInfo }[] = [];
            const deps: string[] = [];
            for (const name of pkgNames) {
              if (newInstalledPackages[name]) {
                lines.push(mkLine('info', `${name} is already the newest version (${newInstalledPackages[name]}).`));
                continue;
              }
              const pkg = PACKAGE_REGISTRY[name];
              if (!pkg) {
                lines.push(mkLine('error', `E: Unable to locate package ${name}`));
                continue;
              }
              toInstall.push({ name, pkg });
              if (pkg.depends) {
                for (const dep of pkg.depends) {
                  if (!newInstalledPackages[dep] && PACKAGE_REGISTRY[dep] && !deps.includes(dep)) {
                    deps.push(dep);
                  }
                }
              }
            }
            if (toInstall.length === 0) break;

            lines.push(mkLine('output', 'Reading package lists... Done'));
            lines.push(mkLine('output', 'Building dependency tree... Done'));
            if (deps.length > 0) {
              lines.push(mkLine('output', `The following additional packages will be installed:`));
              lines.push(mkLine('output', `  ${deps.join(' ')}`));
            }
            lines.push(mkLine('output', `The following NEW packages will be installed:`));
            lines.push(mkLine('output', `  ${toInstall.map(t => t.name).join(' ')}${deps.length > 0 ? ' ' + deps.join(' ') : ''}`));
            const totalNew = toInstall.length + deps.length;
            lines.push(mkLine('output', `${totalNew} newly installed, 0 to remove.`));

            await delay(400);

            for (const dep of deps) {
              const dpkg = PACKAGE_REGISTRY[dep];
              if (dpkg) {
                lines.push(mkLine('output', `Selecting previously unselected package ${dep}.`));
                lines.push(mkLine('output', `Unpacking ${dep} (${dpkg.version}) ...`));
                newInstalledPackages[dep] = dpkg.version;
              }
            }
            for (const { name, pkg } of toInstall) {
              lines.push(mkLine('output', `Selecting previously unselected package ${name}.`));
              lines.push(mkLine('output', `Unpacking ${name} (${pkg.version}) ...`));
              newInstalledPackages[name] = pkg.version;
            }

            await delay(200);
            for (const dep of deps) {
              lines.push(mkLine('output', `Setting up ${dep} (${PACKAGE_REGISTRY[dep]?.version}) ...`));
            }
            for (const { name, pkg } of toInstall) {
              lines.push(mkLine('output', `Setting up ${name} (${pkg.version}) ...`));
            }
            lines.push(mkLine('success', `Done.`));
            break;
          }

          case 'remove':
          case 'purge': {
            if (pkgNames.length === 0) {
              lines.push(mkLine('error', 'E: No packages specified'));
              break;
            }
            lines.push(mkLine('output', 'Reading package lists... Done'));
            lines.push(mkLine('output', 'Building dependency tree... Done'));
            for (const name of pkgNames) {
              if (!newInstalledPackages[name]) {
                lines.push(mkLine('warning', `Package '${name}' is not installed, so not removed`));
                continue;
              }
              const protectedPkgs = ['apt', 'dpkg', 'bash', 'coreutils', 'busybox', 'edenmux-tools'];
              if (protectedPkgs.includes(name)) {
                lines.push(mkLine('error', `E: Refusing to remove essential package: ${name}`));
                continue;
              }
              lines.push(mkLine('output', `Removing ${name} (${newInstalledPackages[name]}) ...`));
              if (subCmd === 'purge') {
                lines.push(mkLine('output', `Purging configuration files for ${name} ...`));
              }
              delete newInstalledPackages[name];
            }
            await delay(200);
            lines.push(mkLine('success', 'Done.'));
            break;
          }

          case 'update': {
            lines.push(mkLine('output', 'Hit:1 https://packages.edenmux.dev stable InRelease'));
            lines.push(mkLine('output', 'Hit:2 https://packages.edenmux.dev stable-games InRelease'));
            lines.push(mkLine('output', 'Hit:3 https://packages.edenmux.dev stable-science InRelease'));
            await delay(400);
            lines.push(mkLine('output', 'Reading package lists... Done'));
            lines.push(mkLine('output', `Building dependency tree... Done`));
            const totalAvail = Object.keys(PACKAGE_REGISTRY).length;
            lines.push(mkLine('success', `All packages are up to date. ${totalAvail} packages available.`));
            break;
          }

          case 'upgrade':
          case 'full-upgrade':
          case 'dist-upgrade': {
            lines.push(mkLine('output', 'Reading package lists... Done'));
            lines.push(mkLine('output', 'Building dependency tree... Done'));
            lines.push(mkLine('output', 'Calculating upgrade... Done'));
            await delay(300);
            lines.push(mkLine('success', '0 upgraded, 0 newly installed, 0 to remove.'));
            break;
          }

          case 'search': {
            const query = (pkgNames[0] || '').toLowerCase();
            if (!query) {
              lines.push(mkLine('error', 'E: No search term specified'));
              break;
            }
            lines.push(mkLine('output', 'Sorting... Done'));
            lines.push(mkLine('output', 'Full Text Search... Done'));
            let found = 0;
            for (const [name, pkg] of Object.entries(PACKAGE_REGISTRY).sort(([a], [b]) => a.localeCompare(b))) {
              if (name.includes(query) || pkg.description.toLowerCase().includes(query)) {
                const installed = newInstalledPackages[name] ? '[installed]' : '';
                lines.push(mkLine('output', `${name}/${pkg.version} ${installed}`));
                lines.push(mkLine('output', `  ${pkg.description}`));
                lines.push(mkLine('output', ''));
                found++;
              }
            }
            if (found === 0) {
              lines.push(mkLine('output', `No packages found matching '${query}'`));
            }
            break;
          }

          case 'show': {
            if (!pkgNames[0]) {
              lines.push(mkLine('error', 'E: No package name specified'));
              break;
            }
            const pkg = PACKAGE_REGISTRY[pkgNames[0]];
            if (!pkg) {
              lines.push(mkLine('error', `E: No packages found matching ${pkgNames[0]}`));
              break;
            }
            const isInst = newInstalledPackages[pkgNames[0]];
            lines.push(mkLine('output', `Package: ${pkgNames[0]}`));
            lines.push(mkLine('output', `Version: ${pkg.version}`));
            lines.push(mkLine('output', `Status: ${isInst ? `install ok installed` : 'not installed'}`));
            lines.push(mkLine('output', `Priority: optional`));
            lines.push(mkLine('output', `Section: ${pkg.section}`));
            lines.push(mkLine('output', `Maintainer: EdenMux Developers`));
            lines.push(mkLine('output', `Installed-Size: ${pkg.size}`));
            if (pkg.depends) {
              lines.push(mkLine('output', `Depends: ${pkg.depends.join(', ')}`));
            }
            lines.push(mkLine('output', `Description: ${pkg.description}`));
            lines.push(mkLine('output', `Homepage: https://packages.edenmux.dev/${pkgNames[0]}`));
            break;
          }

          case 'list': {
            const installedOnly = cmdArgs.includes('--installed');
            const upgradableOnly = cmdArgs.includes('--upgradable');

            if (upgradableOnly) {
              lines.push(mkLine('output', 'Listing... Done'));
              lines.push(mkLine('info', 'All packages are up to date.'));
              break;
            }

            const entries = installedOnly
              ? Object.entries(newInstalledPackages).sort(([a], [b]) => a.localeCompare(b))
              : Object.entries(PACKAGE_REGISTRY).sort(([a], [b]) => a.localeCompare(b));

            lines.push(mkLine('output', 'Listing... Done'));
            for (const [name, verOrPkg] of entries) {
              const ver = typeof verOrPkg === 'string' ? verOrPkg : (verOrPkg as PackageInfo).version;
              const installed = newInstalledPackages[name] ? ' [installed]' : '';
              lines.push(mkLine('output', `${name}/${ver}${installed}`));
            }
            lines.push(mkLine('info', `${entries.length} packages listed`));
            break;
          }

          case 'autoremove': {
            lines.push(mkLine('output', 'Reading package lists... Done'));
            lines.push(mkLine('output', 'Building dependency tree... Done'));
            await delay(200);
            lines.push(mkLine('success', '0 packages removed.'));
            break;
          }

          default:
            lines.push(mkLine('error', `E: Invalid operation ${subCmd}`));
        }
        break;
      }

      case 'apt-cache': {
        const subCmd = cmdArgs[0];
        const pkgNames = cmdArgs.slice(1);

        if (!subCmd) {
          lines.push(mkLine('info', 'apt-cache - query the APT cache'));
          lines.push(mkLine('output', '  apt-cache search <term>   Search packages'));
          lines.push(mkLine('output', '  apt-cache show <pkg>      Show package details'));
          lines.push(mkLine('output', '  apt-cache showpkg <pkg>   Show package info'));
          lines.push(mkLine('output', '  apt-cache stats           Show cache statistics'));
          lines.push(mkLine('output', '  apt-cache depends <pkg>   Show dependencies'));
          lines.push(mkLine('output', '  apt-cache rdepends <pkg>  Show reverse dependencies'));
          lines.push(mkLine('output', '  apt-cache policy <pkg>    Show policy'));
          break;
        }

        switch (subCmd) {
          case 'search': {
            const query = (pkgNames[0] || '').toLowerCase();
            if (!query) { lines.push(mkLine('error', 'E: No search term')); break; }
            for (const [name, pkg] of Object.entries(PACKAGE_REGISTRY).sort(([a], [b]) => a.localeCompare(b))) {
              if (name.includes(query) || pkg.description.toLowerCase().includes(query)) {
                lines.push(mkLine('output', `${name} - ${pkg.description}`));
              }
            }
            break;
          }

          case 'show':
          case 'showpkg': {
            if (!pkgNames[0]) { lines.push(mkLine('error', 'E: No package specified')); break; }
            const pkg = PACKAGE_REGISTRY[pkgNames[0]];
            if (!pkg) { lines.push(mkLine('error', `E: No packages found`)); break; }
            lines.push(mkLine('output', `Package: ${pkgNames[0]}`));
            lines.push(mkLine('output', `Version: ${pkg.version}`));
            lines.push(mkLine('output', `Section: ${pkg.section}`));
            lines.push(mkLine('output', `Installed-Size: ${pkg.size}`));
            lines.push(mkLine('output', `Description: ${pkg.description}`));
            if (pkg.depends) lines.push(mkLine('output', `Depends: ${pkg.depends.join(', ')}`));
            break;
          }

          case 'stats': {
            const total = Object.keys(PACKAGE_REGISTRY).length;
            const installed = Object.keys(newInstalledPackages).length;
            lines.push(mkLine('output', `Total package names: ${total}`));
            lines.push(mkLine('output', `  Installed: ${installed}`));
            lines.push(mkLine('output', `  Available: ${total - installed}`));
            lines.push(mkLine('output', `Total distinct versions: ${total}`));
            break;
          }

          case 'depends': {
            if (!pkgNames[0]) { lines.push(mkLine('error', 'E: No package specified')); break; }
            const pkg = PACKAGE_REGISTRY[pkgNames[0]];
            if (!pkg) { lines.push(mkLine('error', `E: No packages found`)); break; }
            lines.push(mkLine('output', `${pkgNames[0]}`));
            if (pkg.depends && pkg.depends.length > 0) {
              for (const dep of pkg.depends) {
                lines.push(mkLine('output', `  Depends: ${dep}`));
              }
            } else {
              lines.push(mkLine('output', `  (no dependencies)`));
            }
            break;
          }

          case 'rdepends': {
            if (!pkgNames[0]) { lines.push(mkLine('error', 'E: No package specified')); break; }
            lines.push(mkLine('output', `${pkgNames[0]}`));
            lines.push(mkLine('output', `Reverse Depends:`));
            for (const [name, pkg] of Object.entries(PACKAGE_REGISTRY)) {
              if (pkg.depends?.includes(pkgNames[0])) {
                lines.push(mkLine('output', `  ${name}`));
              }
            }
            break;
          }

          case 'policy': {
            if (!pkgNames[0]) { lines.push(mkLine('error', 'E: No package specified')); break; }
            const pkg = PACKAGE_REGISTRY[pkgNames[0]];
            if (!pkg) { lines.push(mkLine('error', `E: Unable to locate package ${pkgNames[0]}`)); break; }
            const isInst = newInstalledPackages[pkgNames[0]];
            lines.push(mkLine('output', `${pkgNames[0]}:`));
            lines.push(mkLine('output', `  Installed: ${isInst || '(none)'}`));
            lines.push(mkLine('output', `  Candidate: ${pkg.version}`));
            lines.push(mkLine('output', `  Version table:`));
            lines.push(mkLine('output', `     ${pkg.version} 500`));
            lines.push(mkLine('output', `        500 https://packages.edenmux.dev stable/main`));
            break;
          }

          default:
            lines.push(mkLine('error', `E: Invalid operation ${subCmd}`));
        }
        break;
      }

      case 'dpkg': {
        const flag = cmdArgs[0];
        const pkgNames = cmdArgs.slice(1).filter(a => !a.startsWith('-'));

        if (!flag || flag === '--help') {
          lines.push(mkLine('info', 'dpkg - Debian package manager'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('output', '  dpkg -l [pattern]    List packages'));
          lines.push(mkLine('output', '  dpkg -s <pkg>        Show package status'));
          lines.push(mkLine('output', '  dpkg -L <pkg>        List files in package'));
          lines.push(mkLine('output', '  dpkg -S <file>       Find package owning file'));
          lines.push(mkLine('output', '  dpkg --list          List all installed'));
          lines.push(mkLine('output', '  dpkg --status <pkg>  Package status'));
          lines.push(mkLine('output', '  dpkg --info <pkg>    Package info'));
          lines.push(mkLine('output', '  dpkg --configure -a  Configure all'));
          break;
        }

        switch (flag) {
          case '-l':
          case '--list': {
            const pattern = pkgNames[0]?.toLowerCase();
            lines.push(mkLine('output', 'Desired=Unknown/Install/Remove/Purge/Hold'));
            lines.push(mkLine('output', '| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend'));
            lines.push(mkLine('output', '|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)'));
            lines.push(mkLine('output', '||/ Name                Version            Description'));
            lines.push(mkLine('output', '+++-===================-==================-====================='));
            const entries = Object.entries(newInstalledPackages).sort(([a], [b]) => a.localeCompare(b));
            for (const [name, ver] of entries) {
              if (pattern && !name.includes(pattern)) continue;
              const desc = PACKAGE_REGISTRY[name]?.description || '';
              lines.push(mkLine('output', `ii  ${name.padEnd(20)} ${ver.padEnd(19)} ${desc.slice(0, 40)}`));
            }
            break;
          }

          case '-s':
          case '--status': {
            if (!pkgNames[0]) { lines.push(mkLine('error', 'dpkg: error: --status needs a package name')); break; }
            const ver = newInstalledPackages[pkgNames[0]];
            const pkg = PACKAGE_REGISTRY[pkgNames[0]];
            if (!ver || !pkg) {
              lines.push(mkLine('error', `dpkg-query: package '${pkgNames[0]}' is not installed`));
              break;
            }
            lines.push(mkLine('output', `Package: ${pkgNames[0]}`));
            lines.push(mkLine('output', `Status: install ok installed`));
            lines.push(mkLine('output', `Priority: optional`));
            lines.push(mkLine('output', `Section: ${pkg.section}`));
            lines.push(mkLine('output', `Installed-Size: ${pkg.size}`));
            lines.push(mkLine('output', `Maintainer: EdenMux Developers`));
            lines.push(mkLine('output', `Architecture: aarch64`));
            lines.push(mkLine('output', `Version: ${ver}`));
            if (pkg.depends) {
              lines.push(mkLine('output', `Depends: ${pkg.depends.join(', ')}`));
            }
            lines.push(mkLine('output', `Description: ${pkg.description}`));
            break;
          }

          case '--info': {
            if (!pkgNames[0]) { lines.push(mkLine('error', 'dpkg: error: --info needs a package name')); break; }
            const pkg = PACKAGE_REGISTRY[pkgNames[0]];
            if (!pkg) { lines.push(mkLine('error', `dpkg-deb: error: no such package`)); break; }
            lines.push(mkLine('output', ` Package: ${pkgNames[0]}`));
            lines.push(mkLine('output', ` Version: ${pkg.version}`));
            lines.push(mkLine('output', ` Section: ${pkg.section}`));
            lines.push(mkLine('output', ` Installed-Size: ${pkg.size}`));
            lines.push(mkLine('output', ` Maintainer: EdenMux Developers`));
            lines.push(mkLine('output', ` Description: ${pkg.description}`));
            break;
          }

          case '-L':
          case '--listfiles': {
            if (!pkgNames[0]) { lines.push(mkLine('error', 'dpkg: error: --listfiles needs a package name')); break; }
            if (!newInstalledPackages[pkgNames[0]]) {
              lines.push(mkLine('error', `dpkg-query: package '${pkgNames[0]}' is not installed`));
              break;
            }
            lines.push(mkLine('output', `/data/data/com.edenmux/files/usr/.`));
            lines.push(mkLine('output', `/data/data/com.edenmux/files/usr/bin/${pkgNames[0]}`));
            lines.push(mkLine('output', `/data/data/com.edenmux/files/usr/lib/${pkgNames[0]}/`));
            lines.push(mkLine('output', `/data/data/com.edenmux/files/usr/share/doc/${pkgNames[0]}/copyright`));
            lines.push(mkLine('output', `/data/data/com.edenmux/files/usr/share/man/man1/${pkgNames[0]}.1.gz`));
            break;
          }

          case '-S':
          case '--search': {
            if (!pkgNames[0]) { lines.push(mkLine('error', 'dpkg: error: --search needs a search pattern')); break; }
            const searchTerm = pkgNames[0].toLowerCase();
            let found = false;
            for (const name of Object.keys(newInstalledPackages).sort()) {
              if (name.includes(searchTerm)) {
                lines.push(mkLine('output', `${name}: /data/data/com.edenmux/files/usr/bin/${name}`));
                found = true;
              }
            }
            if (!found) {
              lines.push(mkLine('error', `dpkg-query: no path found matching pattern *${searchTerm}*`));
            }
            break;
          }

          case '--configure': {
            lines.push(mkLine('output', 'Setting up packages...'));
            await delay(200);
            lines.push(mkLine('success', 'All packages configured.'));
            break;
          }

          default:
            lines.push(mkLine('error', `dpkg: error: unknown option ${flag}`));
            lines.push(mkLine('info', 'Use dpkg --help for help'));
        }
        break;
      }

      case 'curl': {
        if (!session.installedPackages['curl']) {
          lines.push(mkLine('error', `curl: command not found. Install with: pkg install curl`));
          break;
        }
        const curlFlags = args.filter(a => a.startsWith('-'));
        const curlUrls = args.filter(a => !a.startsWith('-'));
        if (curlFlags.includes('--help') || curlFlags.includes('-h')) {
          lines.push(mkLine('output', 'Usage: curl [options...] <url>'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('output', 'Options:'));
          lines.push(mkLine('output', ' -h, --help          Show this help message'));
          lines.push(mkLine('output', ' -V, --version       Show version information'));
          lines.push(mkLine('output', ' -o, --output <file> Write output to <file>'));
          lines.push(mkLine('output', ' -O, --remote-name   Write output to file named as remote file'));
          lines.push(mkLine('output', ' -s, --silent        Silent mode'));
          lines.push(mkLine('output', ' -S, --show-error    Show errors in silent mode'));
          lines.push(mkLine('output', ' -L, --location      Follow redirects'));
          lines.push(mkLine('output', ' -I, --head          Show headers only'));
          lines.push(mkLine('output', ' -v, --verbose       Verbose output'));
          lines.push(mkLine('output', ' -X, --request <cmd> Specify request method (GET, POST, etc.)'));
          lines.push(mkLine('output', ' -H, --header <h>    Add header to request'));
          lines.push(mkLine('output', ' -d, --data <data>   Send data in POST request'));
          lines.push(mkLine('output', ' -u, --user <u:p>    Server user and password'));
          lines.push(mkLine('output', ' -A, --user-agent <str> Set User-Agent header'));
          lines.push(mkLine('output', ' -b, --cookie <data> Send cookies'));
          lines.push(mkLine('output', ' -c, --cookie-jar <f> Save cookies to file'));
          lines.push(mkLine('output', ' -k, --insecure      Allow insecure connections'));
          lines.push(mkLine('output', ' -m, --max-time <s>  Maximum time in seconds'));
          lines.push(mkLine('output', ' --connect-timeout <s> Connection timeout in seconds'));
          lines.push(mkLine('output', ' -w, --write-out <f> Output format after completion'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('info', 'Note: Network requests are sandboxed in EdenMux'));
        } else if (curlFlags.includes('--version') || curlFlags.includes('-V')) {
          lines.push(mkLine('output', 'curl 8.7.1 (aarch64-apple-darwin) libcurl/8.7.1 OpenSSL/3.3.0 zlib/1.3.1 nghttp2/1.61.0'));
          lines.push(mkLine('output', 'Release-Date: 2024-03-27'));
          lines.push(mkLine('output', 'Protocols: dict file ftp ftps gopher gophers http https imap imaps mqtt pop3 pop3s rtsp smb smbs smtp smtps telnet tftp'));
          lines.push(mkLine('output', 'Features: alt-svc AsynchDNS GSS-API HSTS HTTP2 HTTPS-proxy IPv6 Kerberos Largefile libz NTLM SSL threadsafe TLS-SRP UnixSockets'));
        } else if (curlUrls.length === 0) {
          lines.push(mkLine('error', 'curl: try \'curl --help\' for more information'));
        } else {
          lines.push(mkLine('warning', `curl: (7) Failed to connect to ${curlUrls[0]}: Network requests are sandboxed in EdenMux`));
          lines.push(mkLine('info', 'Tip: Network access is not available in the terminal emulator'));
        }
        break;
      }

      case 'wget': {
        if (!session.installedPackages['wget']) {
          lines.push(mkLine('error', `wget: command not found. Install with: pkg install wget`));
          break;
        }
        if (args.includes('--help') || args.includes('-h')) {
          lines.push(mkLine('output', 'GNU Wget 1.24.5, a non-interactive network retriever.'));
          lines.push(mkLine('output', 'Usage: wget [OPTION]... [URL]...'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('output', 'Startup:'));
          lines.push(mkLine('output', '  -V, --version           Display version and exit'));
          lines.push(mkLine('output', '  -h, --help              Print this help'));
          lines.push(mkLine('output', '  -q, --quiet             Turn off output'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('output', 'Download:'));
          lines.push(mkLine('output', '  -O, --output-document=FILE  Write to FILE'));
          lines.push(mkLine('output', '  -c, --continue              Resume download'));
          lines.push(mkLine('output', '  -r, --recursive             Recursive download'));
          lines.push(mkLine('output', '  -l, --level=NUMBER          Max recursion depth'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('info', 'Note: Network requests are sandboxed in EdenMux'));
        } else if (args.includes('--version') || args.includes('-V')) {
          lines.push(mkLine('output', 'GNU Wget 1.24.5 built on aarch64-apple-darwin.'));
          lines.push(mkLine('output', '+digest +https +ipv6 +iri +large-file +metalink +nls +ntlm +opie +psl +ssl/openssl'));
        } else if (args.length === 0) {
          lines.push(mkLine('error', 'wget: missing URL'));
          lines.push(mkLine('info', 'Usage: wget [OPTION]... [URL]...'));
        } else {
          lines.push(mkLine('warning', `wget: unable to resolve host address '${args[args.length - 1]}': Network requests are sandboxed in EdenMux`));
        }
        break;
      }

      case 'git': {
        if (!session.installedPackages['git']) {
          lines.push(mkLine('error', `git: command not found. Install with: pkg install git`));
          break;
        }
        if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
          lines.push(mkLine('output', 'usage: git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]'));
          lines.push(mkLine('output', '           [--exec-path[=<path>]] [--html-path] [--man-path] [--info-path]'));
          lines.push(mkLine('output', '           [-p | --paginate | -P | --no-pager] [--no-replace-objects] [--bare]'));
          lines.push(mkLine('output', '           [--git-dir=<path>] [--work-tree=<path>] [--namespace=<name>]'));
          lines.push(mkLine('output', '           [--config-env=<name>=<envvar>] <command> [<args>]'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('output', 'These are common Git commands used in various situations:'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('output', 'start a working area'));
          lines.push(mkLine('output', '   clone   Clone a repository'));
          lines.push(mkLine('output', '   init    Create an empty Git repository'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('output', 'work on the current change'));
          lines.push(mkLine('output', '   add     Add file contents to the index'));
          lines.push(mkLine('output', '   mv      Move or rename a file'));
          lines.push(mkLine('output', '   rm      Remove files from the working tree'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('output', 'examine the history and state'));
          lines.push(mkLine('output', '   log     Show commit logs'));
          lines.push(mkLine('output', '   status  Show the working tree status'));
          lines.push(mkLine('output', '   diff    Show changes between commits'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('info', 'Note: Git operations are simulated in EdenMux'));
        } else if (args.includes('--version')) {
          lines.push(mkLine('output', 'git version 2.45.1'));
        } else if (args.length === 0) {
          lines.push(mkLine('error', 'usage: git <command> [<args>]'));
          lines.push(mkLine('info', 'Run \'git --help\' for more information'));
        } else {
          lines.push(mkLine('warning', `git: '${args[0]}' is not available in EdenMux sandbox`));
          lines.push(mkLine('info', 'Git operations require network access and are simulated'));
        }
        break;
      }

      case 'ssh': {
        if (!session.installedPackages['openssh']) {
          lines.push(mkLine('error', `ssh: command not found. Install with: pkg install openssh`));
          break;
        }
        if (args.includes('-h') || args.length === 0) {
          lines.push(mkLine('output', 'usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface]'));
          lines.push(mkLine('output', '           [-b bind_address] [-c cipher_spec] [-D [bind_address:]port]'));
          lines.push(mkLine('output', '           [-E log_file] [-e escape_char] [-F configfile]'));
          lines.push(mkLine('output', '           [-I pkcs11] [-i identity_file] [-J [user@]host[:port]]'));
          lines.push(mkLine('output', '           [-L address] [-l login_name] [-m mac_spec]'));
          lines.push(mkLine('output', '           [-O ctl_cmd] [-o option] [-p port] [-Q query_option]'));
          lines.push(mkLine('output', '           [-R address] [-S ctl_path] [-W host:port]'));
          lines.push(mkLine('output', '           [-w local_tun[:remote_tun]] destination [command [argument ...]]'));
        } else if (args.includes('-V')) {
          lines.push(mkLine('output', 'OpenSSH_9.7p1, OpenSSL 3.3.0 9 Apr 2024'));
        } else {
          lines.push(mkLine('warning', `ssh: connect to host ${args[args.length - 1]}: Network is sandboxed in EdenMux`));
        }
        break;
      }

      case 'scp':
      case 'sftp': {
        if (!session.installedPackages['openssh']) {
          lines.push(mkLine('error', `${cmd}: command not found. Install with: pkg install openssh`));
          break;
        }
        lines.push(mkLine('warning', `${cmd}: Network operations are sandboxed in EdenMux`));
        break;
      }

      case 'python':
      case 'python3': {
        if (!session.installedPackages['python']) {
          lines.push(mkLine('error', `${cmd}: command not found. Install with: pkg install python`));
          break;
        }
        if (args.includes('--version') || args.includes('-V')) {
          lines.push(mkLine('output', 'Python 3.12.3'));
        } else if (args.includes('--help') || args.includes('-h')) {
          lines.push(mkLine('output', 'usage: python3 [option] ... [-c cmd | -m mod | file | -] [arg] ...'));
          lines.push(mkLine('output', 'Options:'));
          lines.push(mkLine('output', '  -c cmd   program passed in as string'));
          lines.push(mkLine('output', '  -h       print this help message and exit'));
          lines.push(mkLine('output', '  -V       print version and exit'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('info', 'Note: Python scripts are not executable in EdenMux.'));
        } else {
          lines.push(mkLine('info', 'Python interpreter is not interactive in EdenMux.'));
          lines.push(mkLine('info', 'Use the calc command for math, or ask Eden for help.'));
        }
        break;
      }

      case 'node': {
        if (args.includes('--version') || args.includes('-v')) {
          lines.push(mkLine('output', 'v22.2.0'));
        } else if (args.includes('--help') || args.includes('-h')) {
          lines.push(mkLine('output', 'Usage: node [options] [script.js] [arguments]'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('info', 'Note: JavaScript execution is not available in EdenMux (Apple App Store rules).'));
        } else if (args.length === 0) {
          lines.push(mkLine('warning', 'node: not available in EdenMux'));
          lines.push(mkLine('info', 'JavaScript execution was removed to comply with Apple App Store rules.'));
        } else {
          lines.push(mkLine('warning', 'node: not available in EdenMux'));
          lines.push(mkLine('info', 'JavaScript execution was removed to comply with Apple App Store rules.'));
        }
        break;
      }

      case 'pip':
      case 'pip3': {
        if (!session.installedPackages['python']) {
          lines.push(mkLine('error', `${cmd}: command not found. Install python with: pkg install python`));
          break;
        }
        if (args.includes('--help') || args.includes('-h') || args.length === 0) {
          lines.push(mkLine('output', 'Usage: pip <command> [options]'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('output', 'Commands:'));
          lines.push(mkLine('output', '  install     Install packages'));
          lines.push(mkLine('output', '  uninstall   Uninstall packages'));
          lines.push(mkLine('output', '  list        List installed packages'));
          lines.push(mkLine('output', '  show        Show package details'));
          lines.push(mkLine('output', '  search      Search PyPI'));
          lines.push(mkLine('output', '  --version   Show version'));
          lines.push(mkLine('output', ''));
          lines.push(mkLine('info', 'Note: pip operations are sandboxed in EdenMux'));
        } else if (args.includes('--version') || args.includes('-V')) {
          lines.push(mkLine('output', 'pip 24.0 from /data/data/com.edenmux.app/files/usr/lib/python3.12/site-packages/pip (python 3.12)'));
        } else {
          lines.push(mkLine('warning', `pip: '${args[0]}' operations require network access and are sandboxed in EdenMux`));
        }
        break;
      }

      case 'exit':
      case 'logout':
        lines.push(mkLine('system', '__EXIT__'));
        break;

      default:
        lines.push(mkLine('error', `${cmd}: command not found`));
        lines.push(mkLine('info', 'Type "help" for available commands'));
        break;
    }
  } catch (error: any) {
    lines.push(mkLine('error', `Error: ${error.message}`));
  }

  return { lines, newCwd, newEnv, newAliases, newInstalledPackages };
}

export function createSession(name?: string): TerminalSession {
  return {
    id: generateId(),
    name: name || `session`,
    lines: [
      {
        id: generateId(),
        type: 'system',
        content: 'EdenMux v1.0 - iOS Shell Emulator',
        timestamp: Date.now(),
      },
      {
        id: generateId(),
        type: 'info',
        content: 'Type "help" for available commands, "motd" for welcome info',
        timestamp: Date.now(),
      },
    ],
    cwd: BASE_DIR,
    history: [],
    historyIndex: -1,
    env: {
      HOME: '~',
      USER: 'mobile',
      SHELL: '/bin/edenmux',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      HOSTNAME: 'edenmux',
      PREFIX: '/data/data/com.edenmux/files/usr',
      TMPDIR: '~/.cache',
      EDITOR: 'vi',
      PAGER: 'less',
    },
    aliases: {
      'll': 'ls -la',
      'la': 'ls -a',
      'l': 'ls -l',
      '..': 'cd ..',
      '...': 'cd ../..',
      'cls': 'clear',
      'q': 'exit',
    },
    installedPackages: { ...DEFAULT_INSTALLED },
    createdAt: Date.now(),
  };
}
