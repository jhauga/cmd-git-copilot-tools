import * as readline from 'readline';

export type KeyName =
  | 'up' | 'down' | 'left' | 'right'
  | 'pageup' | 'pagedown'
  | 'enter' | 'return'
  | 'backspace'
  | 'delete'
  | 'escape'
  | 'tab'
  | 'space'
  | string; // printable chars or raw sequences

export interface KeyPress {
  name: KeyName;
  sequence: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  ch?: string; // printable character if applicable
}

/**
 * Read a single keypress from stdin in raw mode.
 * Returns a Promise that resolves to the KeyPress.
 */
export function readRawKey(): Promise<KeyPress> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    const onData = (data: Buffer) => {
      if (stdin.isTTY && !wasRaw) {
        stdin.setRawMode(false);
      }
      stdin.pause();
      stdin.removeListener('data', onData);
      resolve(parseKeyPress(data));
    };

    stdin.once('data', onData);
  });
}

/**
 * Read a full line of input with a prompt (not raw mode).
 */
export function readLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Read a confirmation (y/n) from the user.
 */
export async function readConfirm(prompt: string): Promise<boolean> {
  const answer = await readLine(`${prompt} [y/N] `);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

/**
 * Read an authentication permission choice with 'always' option.
 * Returns: 'yes', 'no', or 'always'
 */
export async function readAuthPermission(prompt: string): Promise<'yes' | 'no' | 'always'> {
  const answer = await readLine(`${prompt} [y/N/always] `);
  const lower = answer.toLowerCase();
  
  if (lower === 'always') {
    return 'always';
  }
  if (lower === 'y' || lower === 'yes') {
    return 'yes';
  }
  return 'no';
}

function parseKeyPress(buf: Buffer): KeyPress {
  const sequence = buf.toString();
  let name: KeyName = sequence;
  let ctrl = false;
  let meta = false;
  const shift = false;
  let ch: string | undefined;

  // ESC sequences
  if (buf[0] === 0x1b) {
    if (buf.length === 1) {
      name = 'escape';
    } else if (buf[1] === 0x5b) {
      // ESC [ ...
      const code = buf.slice(2).toString();
      switch (code) {
        case 'A': name = 'up'; break;
        case 'B': name = 'down'; break;
        case 'C': name = 'right'; break;
        case 'D': name = 'left'; break;
        case '5~': name = 'pageup'; break;
        case '6~': name = 'pagedown'; break;
        case '3~': name = 'delete'; break;
        case 'H': name = 'home'; break;
        case 'F': name = 'end'; break;
        default: name = `escape[${code}`; break;
      }
    } else if (buf[1] === 0x4f) {
      // ESC O ...
      const code = String.fromCharCode(buf[2]!);
      switch (code) {
        case 'A': name = 'up'; break;
        case 'B': name = 'down'; break;
        case 'C': name = 'right'; break;
        case 'D': name = 'left'; break;
        default: name = `escape-O-${code}`; break;
      }
    } else {
      meta = true;
      name = String.fromCharCode(buf[1]!);
    }
  } else if (buf[0] === 0x0d || buf[0] === 0x0a) {
    name = 'enter';
  } else if (buf[0] === 0x7f || buf[0] === 0x08) {
    name = 'backspace';
  } else if (buf[0] === 0x09) {
    name = 'tab';
  } else if (buf[0] === 0x03) {
    // Ctrl+C
    ctrl = true;
    name = 'c';
    // Exit process on Ctrl+C
    process.stdout.write('\x1b[?25h'); // show cursor
    process.exit(0);
  } else if (buf[0] !== undefined && buf[0] < 32) {
    // Other control characters
    ctrl = true;
    name = String.fromCharCode(buf[0]! + 64).toLowerCase();
  } else {
    // Printable character
    ch = sequence;
    name = ch;
  }

  return { name, sequence, ctrl, meta, shift, ch };
}

/**
 * Setup readline to handle keypress events on stdin.
 * Must be called before using readRawKey in some environments.
 */
export function setupReadline(): void {
  readline.emitKeypressEvents(process.stdin);
}

/**
 * Restore terminal state on exit.
 */
export function restoreTerminal(): void {
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false);
  }
  process.stdout.write('\x1b[?25h'); // show cursor
}
