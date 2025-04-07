const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const STOCKFISH_PATH = `./stockfish`; // Path to your binary

app.post('/evaluate', (req, res) => {
    const { fen } = req.body;
    if (!fen) return res.status(400).json({ error: 'Missing FEN' });
    console.log('fen', fen);

    const stockfish = spawn(STOCKFISH_PATH);
    let bestMove = '';
    let evalScore = null;
    let pvLine = '';

    stockfish.stdin.write(`uci\n`);
    stockfish.stdin.write(`ucinewgame\n`);
    stockfish.stdin.write(`position fen ${fen}\n`);
    stockfish.stdin.write(`setoption name MultiPV value 1\n`);
    stockfish.stdin.write(`go depth 10\n`);

    stockfish.stdout.on('data', (data) => {

        const lines = data.toString().split('\n');
        // console.log('data1', lines);


        lines.forEach((line) => {
            if (line.startsWith('info') && line.includes(' pv ')) {
                const parts = line.trim().split(/\s+/);
                const pvIndex = parts.indexOf('pv');
                if (pvIndex !== -1) {
                    pvLine = parts.slice(pvIndex + 1).join(' ');
                }

                const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
                if (scoreMatch) {
                    const type = scoreMatch[1];
                    const value = parseInt(scoreMatch[2], 10);
                    evalScore = type === 'mate' ? (value > 0 ? 10000 : -10000) : value;
                }
            }

            if (line.startsWith('bestmove')) {
                bestMove = line.split(' ')[1];

                res.json({
                    bestMove,
                    eval: evalScore,
                    pv: pvLine.trim().split(' '),
                });

                stockfish.kill();
            }
        });
    });

    stockfish.stderr.on('data', (data) => {
        console.error('Stockfish error:', data.toString());
    });

    stockfish.on('exit', (code) => {
        console.log(`Stockfish exited with code ${code}`);
    });
});

function getLegalMoves(fen) {
    return new Promise((resolve) => {
        const stockfish = spawn('./stockfish');

        let buffer = '';

        stockfish.stdout.on('data', (data) => {
            const output = data.toString();
            buffer += output;

            // console.log('buffer: ', buffer);

            // When perft ends
            if (buffer.includes('Nodes searched')) {
                const moveLines = buffer.match(/^([a-h][1-8][a-h][1-8][qrbn]?): \d+/gm) || [];
                const moves = moveLines.map(line => line.split(':')[0]);
                stockfish.kill();
                resolve(moves);
            }
        });

        // Feed commands
        stockfish.stdin.write(`uci\n`);
        stockfish.stdin.write(`ucinewgame\n`);
        stockfish.stdin.write(`position fen ${fen}\n`);
        stockfish.stdin.write(`go perft 1\n`);

    });
}

app.get('/topmoves2', (req, res) => {
    const { fen } = req.query;
    if (!fen) return res.status(400).json({ error: 'Missing FEN' });
    console.log('fen', fen);

    const stockfish = spawn(STOCKFISH_PATH);
    let bestMove = '';
    let evalScore = null;
    let pvLine = '';

    getLegalMoves(fen).then((moves) => {
        console.log('Legal moves:', moves);
        res.send()
    });
    // stockfish.stdin.write(`uci\n`);
    // stockfish.stdin.write(`ucinewgame\n`);
    // stockfish.stdin.write(`position fen ${fen}\n`);
    // stockfish.stdin.write('d\n');
    // stockfish.stdout.on('data', (data) => {
    //     const lines = data.toString().split('\n');
    //     lines.forEach((line) => {
    //         console.log('lines: valid moves', line);

    //     })

    //     // res.json({
    //     //     'done': 1
    //     // });

    //     // stockfish.kill();

    // })

    stockfish.stderr.on('data', (data) => {
        console.error('Stockfish error:', data.toString());
    });

    stockfish.on('exit', (code) => {
        console.log(`Stockfish exited with code ${code}`);
    });
})

function sendToEngine(engine, command) {
    engine.stdin.write(command + '\n');
}

function waitForOutput(engine, pattern) {
    return new Promise((resolve) => {
        let buffer = '';
        const onData = (data) => {
            buffer += data.toString();
            if (buffer.includes(pattern)) {
                engine.stdout.off('data', onData);
                resolve(buffer);
            }
        };
        engine.stdout.on('data', onData);
    });
}

async function getLegalMovesWithScores(fen) {
    console.log('d10');

    const stockfish = spawn('./stockfish');
    console.log('d100', stockfish);
    await waitForOutput(stockfish, 'Stockfish');

    console.log('d1000');
    sendToEngine(stockfish, 'uci');
    await waitForOutput(stockfish, 'uciok');

    console.log('d10000');
    sendToEngine(stockfish, 'isready');

    await waitForOutput(stockfish, 'readyok');
    console.log('d100000');

    sendToEngine(stockfish, 'ucinewgame');
    sendToEngine(stockfish, `position fen ${fen}`);
    sendToEngine(stockfish, 'go perft 1');
    console.log('d11');

    const perftOutput = await waitForOutput(stockfish, 'Nodes searched');
    console.log('d12');

    const legalMoves = [];
    for (const line of perftOutput.split('\n')) {
        const match = line.match(/^([a-h][1-8][a-h][1-8][qrbn]?):/);
        if (match) legalMoves.push(match[1]);
        console.log('d13');
    }

    const evaluations = [];
    for (const move of legalMoves) {
        sendToEngine(stockfish, `position fen ${fen} moves ${move}`);
        sendToEngine(stockfish, 'go depth 1');
        const evalOutput = await waitForOutput(stockfish, 'bestmove');

        let cp = null;
        const cpMatch = evalOutput.match(/score cp (-?\d+)/);
        const mateMatch = evalOutput.match(/score mate (-?\d+)/);

        if (cpMatch) cp = parseInt(cpMatch[1], 10);
        else if (mateMatch) cp = mateMatch[1] < 0 ? -99999 : 99999;

        evaluations.push({
            move: move,
            from: move.substring(0, 2),
            to: move.substring(2, 4),
            cp: cp !== null ? (cp / 100).toFixed(2) * 1 : null, // Convert to decimal with 2 places
        });
    }
    console.log('d14');


    stockfish.kill();
    console.log('d15');

    return evaluations;
}

app.get('/topmoves3', async (req, res) => {
    const { fen } = req.query;
    console.log('topmoves3: ', fen);


    if (!fen) {
        return res.status(400).json({ error: 'FEN not provided' });
    }

    console.log('d0');

    try {
        console.log('d00');

        const data = await getLegalMovesWithScores(fen);
        console.log('d000');

        res.json({ fen, evaluations: data });
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ error: 'Failed to evaluate moves' });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});