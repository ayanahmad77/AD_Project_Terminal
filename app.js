#!/opt/homebrew/bin/node

const { spawn } = require('child_process');
const fs = require('fs');

process.stdin.setRawMode(true);
process.stdin.resume();

const songDir = './songs';

let songs = fs.readdirSync(songDir)
    .filter(s => s.toLowerCase().endsWith('.mp3'));

let current = 0;
let vlc = null;

if (songs.length === 0) {
    console.log('No MP3 files found in songs folder.');
    process.exit(0);
}

function clear() {
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

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
    console.log('E Exit');
    console.log('------------------------------------');
}

function play(song) {
    if (vlc) {
        vlc.kill();
    }

    vlc = spawn('vlc', [
        '--intf', 'dummy',
        '--no-video',
        songDir + '/' + song
    ], {
        stdio: 'ignore'
    });
}

function exit() {
    if (vlc) {
        vlc.kill();
    }

    process.stdin.setRawMode(false);

    clear();

    console.log('Music Player exited.');

    process.exit(0);
}

process.stdin.on('data', data => {
    let key = data.toString().toLowerCase();

    if (key === 'e') {
        exit();
        return;
    }

    if (data[2] === 0x41) {
        if (current > 0) {
            current--;
        }

        show();
        return;
    }

    if (data[2] === 0x42) {
        if (current < songs.length - 1) {
            current++;
        }

        show();
        return;
    }

    if (data[0] === 0x0d) {
        play(songs[current]);
        show();
        return;
    }
});

show();