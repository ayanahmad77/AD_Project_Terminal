#!/opt/homebrew/bin/node

// Modules
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');

// Keyboard input
process.stdin.setRawMode(true);
process.stdin.resume();

// Files and folders
const songDir = './songs';
const port = 4212;

// Get songs
let songs = fs.readdirSync(songDir)
    .filter(s => s.toLowerCase().endsWith('.mp3'));

// Player variables
let current = 0;
let vlc = null;
let client = null;
let connected = false;

// Player states
let paused = false;
let stopped = true;

// Check songs
if (songs.length === 0) {
    console.log('No MP3 files found in songs folder.');
    process.exit(0);
}

// Clear terminal
function clear() {
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

// Main screen
function show() {
    clear();

    console.log('====================================');
    console.log('        🎵 TERMINAL MUSIC PLAYER');
    console.log('====================================\n');

    songs.forEach((song, i) => {
        console.log(
            `${i === current ? '  >' : '   '} ${i + 1}. ${song}`
        );
    });

    console.log('\n------------------------------------');
    console.log('↑ ↓ Select    Enter Play');
    console.log('P Pause       S Stop');
    console.log('N Next        B Previous');
    console.log('E Exit');
    console.log('------------------------------------');

    if (!stopped) {
        console.log(
            `\n${paused ? '⏸ PAUSED' : '▶ PLAYING'}: ${songs[current]}`
        );
    } else {
        console.log('\n⏹ STOPPED');
    }
}

// Send VLC command
function command(cmd) {
    if (
        client &&
        connected &&
        !client.destroyed
    ) {
        client.write(cmd + '\n');
    }
}

// Start VLC
function startVLC() {
    vlc = spawn('vlc', [
        '--intf', 'dummy',
        '--extraintf', 'rc',
        '--rc-host', `127.0.0.1:${port}`,
        '--no-video',
        '--no-osd'
    ], {
        stdio: 'ignore'
    });

    connectVLC();
}

// Connect to VLC
function connectVLC() {
    if (connected) return;

    client = net.createConnection({
        host: '127.0.0.1',
        port: port
    });

    client.on('connect', () => {
        connected = true;
        show();
    });

    client.on('error', () => {
        connected = false;

        setTimeout(() => {
            if (!connected && vlc) {
                connectVLC();
            }
        }, 500);
    });

    client.on('close', () => {
        connected = false;
    });
}

// Play song
function play(song) {
    if (!connected) return;

    stopped = false;
    paused = false;

    command('stop');
    command('clear');

    command(`add ${songDir}/${song}`);

    show();
}

// Stop song
function stop() {
    stopped = true;
    paused = false;

    command('stop');

    show();
}

// Next song
function nextSong() {
    current++;

    if (current >= songs.length) {
        current = 0;
    }

    play(songs[current]);
}

// Previous song
function previousSong() {
    current--;

    if (current < 0) {
        current = songs.length - 1;
    }

    play(songs[current]);
}

// Exit
function exit() {
    command('stop');
    command('quit');

    if (client) {
        client.destroy();
    }

    if (vlc) {
        vlc.kill();
    }

    process.stdin.setRawMode(false);

    clear();

    console.log('Music Player exited.');

    process.exit(0);
}

// Keyboard controls
process.stdin.on('data', data => {
    let key = data.toString().toLowerCase();

    // E = Exit
    if (key === 'e') {
        exit();
        return;
    }

    // UP
    if (data[2] === 0x41) {
        if (current > 0) {
            current--;
        }

        show();
        return;
    }

    // DOWN
    if (data[2] === 0x42) {
        if (current < songs.length - 1) {
            current++;
        }

        show();
        return;
    }

    // ENTER = Play
    if (data[0] === 0x0d) {
        play(songs[current]);
        return;
    }

    // P = Pause / Resume
    if (
        key === 'p' &&
        !stopped
    ) {
        command('pause');

        paused = !paused;

        show();

        return;
    }

    // S = Stop
    if (key === 's') {
        stop();
        return;
    }

    // N = Next
    if (key === 'n') {
        nextSong();
        return;
    }

    // B = Previous
    if (key === 'b') {
        previousSong();
        return;
    }
});

// Start player
startVLC();