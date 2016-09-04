const {spawn} = require('child_process');
const concat = require('concat-stream');
const Slack = require('node-slackr');

const slack = new Slack(process.env.SLACK_WEBHOOK_URL, {channel: '#isucon'});

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('db.sqlite3');

const express = require('express');
const router = express.Router();

let executing = false;

/* GET home page. */
router.get('/', (req, res, next) => {
  db.all('SELECT * FROM executions ORDER BY id DESC LIMIT 100', (error, executions) => {
    if (error) return res.sendStatus(500);
    res.render('index', {title: 'Express', executions});
  });
});

router.post('/', (req, res, next) => {
  if (executing) {
    res.json({error: true, message: 'Benchmark is running'});
  } else {
    const ip = process.env.WEBAPP_IP || '127.0.0.1';
    executing = true;

    db.run('INSERT INTO executions (status, timestamp) VALUES (0, ?)', Date.now(), function () {
      const executionID = this.lastID;

      const benchmarker = spawn('/opt/go/bin/benchmarker', [
        '-t', `http://${ip}/`,
        '-u', '/opt/go/src/github.com/catatsuy/private-isu/benchmarker/userdata',
      ]);

      slack.notify('Benchmark started');

      let data

      Promise.all([new Promise((resolve, reject) => {
        benchmarker.stdout.pipe(concat((data) => {
          resolve(data);
        }));
      }), new Promise((resolve, reject) => {
        benchmarker.stderr.pipe(concat((data) => {
          resolve(data);
        }));
      }), new Promise((resolve, reject) => {
        benchmarker.on('close', (code) => {
          resolve(code);
        });
      })]).then(([stdout, stderr, code]) => {
        executing = false;

        const {score, result} = (() => {
          if (code !== 0 && code !== 2) {
            return {
              score: 0,
              result: JSON.stringify({
                message: `exit code ${code}`,
                stdout: stdout.toString(),
                stderr: stderr.toString(),
                code: code,
              }),
            };
          } else {
            let data;

            try {
              data = JSON.parse(stdout);
            } catch (e) {
              return {
                score: 0,
                result: JSON.stringify({
                  message: `JSON decode error while parsing "${stdout}"`,
                  stdout: stdout.toString(),
                  stderr: stderr.toString(),
                  code: code,
                }),
              };
            }

            return {
              score: data.score || 0,
              result: stdout.toString(),
            };
          }
        })();

        db.run('UPDATE executions SET status = 1, score = $score, result = $result WHERE id = $id', {
          $score: score,
          $result: result,
          $id: executionID,
        });

        slack.notify(`Benchmark finished (Score: ${score})`);
      })

      res.redirect('/');
    });
  }
});

module.exports = router;
