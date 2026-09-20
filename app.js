#!/opt/homebrew/bin/node

// Modules
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { pathToFileURL } = require('url');

// Keyboard input
process.stdin.setRawMode(true);
process.stdin.resume();

// Files and folders
const songDir = './songs';
const favFile = './favorites.json';
const port = 4212;

// Get songs
let songs = fs.readdirSync(songDir)
    .filter(s => s.toLowerCase().endsWith('.mp3'));

// Load favorites
let favorites = fs.existsSync(favFile)
    ? JSON.parse(fs.readFileSync(favFile, 'utf8') || '[]')
    : [];

// Player variables
let current = 0;
let vlc = null;
let client = null;
let connected = false;

// Player states
let paused = false;
let shuffle = false;
let repeat = false;
let stopped = true;
let inFavorites = false;

// Progress variables
let duration = 0;
let progress = 0;
let timer = null;
let syncTimer = null;

// Check songs
if (songs.length === 0) {
    console.log('No MP3 files found in songs folder.');
    process.exit(0);
}

// Clear terminal
function clear() {
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

// Save favorites
function saveFavorites() {
    fs.writeFileSync(
        favFile,
        JSON.stringify(favorites, null, 2)
    );
}

// Convert seconds to MM:SS
function time(sec) {
    sec = Math.max(0, Math.floor(sec));

    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

// Progress bar
function bar() {
    if (!duration) {
        return '[--------------------]';
    }

    let filled = Math.floor(
        (progress / duration) * 20
    );

    filled = Math.max(0, Math.min(20, filled));

    return `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}]`;
}

// Main screen
function show() {
    clear();

    console.log('====================================');
    console.log('        🎵 TERMINAL MUSIC PLAYER');
    console.log('====================================\n');

    songs.forEach((song, i) => {
        let fav = favorites.includes(song) ? ' ❤️' : '';

        console.log(
            `${i === current ? '  >' : '   '} ${i + 1}. ${song}${fav}`
        );
    });

    console.log('\n------------------------------------');
    console.log('↑ ↓ Select    Enter Play');
    console.log('P Pause       S Stop');
    console.log('N Next        B Previous');
    console.log('H Shuffle     R Repeat');
    console.log('F Favorite    L Favorites');
    console.log('E Exit');
    console.log('------------------------------------');

    if (!stopped) {
        console.log(
            `\n${paused ? '⏸ PAUSED' : '▶ PLAYING'}: ${songs[current]}`
        );

        console.log(
            `${bar()} ${time(progress)} / ${time(duration)}`
        );
    } else {
        console.log('\n⏹ STOPPED');
    }

    console.log(`🔀 Shuffle: ${shuffle ? 'ON' : 'OFF'}`);
    console.log(`🔁 Repeat: ${repeat ? 'ON' : 'OFF'}`);
}

// Favorites screen
function showFavorites() {
    clear();

    console.log('====================================');
    console.log('          ❤️ FAVORITES');
    console.log('====================================\n');

    if (favorites.length) {
        favorites.forEach((song, i) => {
            console.log(`❤️ ${i + 1}. ${song}`);
        });
    } else {
        console.log('No favorite songs yet.');
    }

    console.log('\nPress any key to return');
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

// Get value from VLC
function getValue(commandName, callback) {
    if (
        !client ||
        !connected ||
        client.destroyed
    ) {
        return;
    }

    let data = '';

    function receive(chunk) {
        data += chunk.toString();

        let lines = data.split(/\r?\n/);

        for (let line of lines) {
            line = line.trim();

            if (/^\d+(\.\d+)?$/.test(line)) {
                client.off('data', receive);
                callback(Number(line));
                return;
            }
        }
    }

    client.on('data', receive);

    client.write(commandName + '\n');

    setTimeout(() => {
        client.off('data', receive);
    }, 500);
}

// Get actual position from VLC
function syncProgress() {
    if (
        stopped ||
        paused ||
        !connected
    ) {
        return;
    }

    getValue('get_length', length => {
        if (length > 0) {
            duration = length;
        }

        getValue('get_time', currentTime => {
            progress = currentTime;
        });
    });
}

// Smooth progress animation
function startTimer() {
    stopTimer();

    progress = 0;

    syncTimer = setInterval(() => {
        syncProgress();
    }, 1000);

    timer = setInterval(() => {
        if (
            !paused &&
            !stopped &&
            duration > 0
        ) {
            progress += 0.1;

            if (progress >= duration) {
                progress = duration;
                nextSong();
                return;
            }

            show();
        }
    }, 100);
}

// Stop timers
function stopTimer() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }

    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
}

// Play song
function play(song) {
    if (!connected) return;

    stopped = false;
    paused = false;
    progress = 0;
    duration = 0;

    stopTimer();

    command('stop');
    command('clear');

    let file = pathToFileURL(
        path.resolve(songDir, song)
    ).href;

    command(`add ${file}`);

    show();

    setTimeout(() => {
        syncProgress();
        startTimer();
    }, 700);
}

// Stop song
function stop() {
    stopped = true;
    paused = false;
    progress = 0;
    duration = 0;

    stopTimer();

    command('stop');

    show();
}

// Next song
function nextSong() {
    if (repeat) {
        play(songs[current]);
        return;
    }

    if (songs.length === 0) return;

    if (
        shuffle &&
        songs.length > 1
    ) {
        let next;

        do {
            next = Math.floor(
                Math.random() * songs.length
            );
        } while (next === current);

        current = next;
    } else {
        current++;

        if (current >= songs.length) {
            current = 0;
        }
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
    stopTimer();

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

    // Return from favorites
    if (inFavorites) {
        inFavorites = false;
        show();
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

        if (!paused) {
            syncProgress();
        }

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

    // H = Shuffle
    if (key === 'h') {
        shuffle = !shuffle;

        show();

        return;
    }

    // R = Repeat
    if (key === 'r') {
        repeat = !repeat;

        show();

        return;
    }

    // F = Favorite
    if (key === 'f') {
        let song = songs[current];

        let index = favorites.indexOf(song);

        if (index === -1) {
            favorites.push(song);
        } else {
            favorites.splice(index, 1);
        }

        saveFavorites();

        show();

        return;
    }

    // L = Favorites
    if (key === 'l') {
        inFavorites = true;

        showFavorites();

        return;
    }
});

// Start player
startVLC();