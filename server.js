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

    const stockfish = spawn(STOCKFISH_PATH);
    let bestMove = '';
    let evalScore = null;
    let pvLine = '';

    stockfish.stdin.write(`uci\n`);
    stockfish.stdin.write(`ucinewgame\n`);
    stockfish.stdin.write(`position fen ${fen}\n`);
    stockfish.stdin.write(`setoption name MultiPV value 1\n`);
    stockfish.stdin.write(`go depth 15\n`);

    stockfish.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');

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

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});