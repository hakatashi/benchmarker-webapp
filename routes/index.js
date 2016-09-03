const {spawn} = require('child_process');
const concat = require('concat-stream');

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('db.sqlite3');

const express = require('express');
const router = express.Router();

let executing = false;

/* GET home page. */
router.get('/', (req, res, next) => {
  db.all('SELECT * FROM executions LIMIT 100', (error, executions) => {
    if (error) return res.sendStatus(500);
    res.render('index', {title: 'Express', executions});
  });
});

router.post('/', (req, res, next) => {
  if (executing) {
    res.json({error: true});
  } else {
    const ip = process.env.WEBAPP_IP || '127.0.0.1';

    db.run('INSERT INTO executions (status, timestamp) VALUES (0, ?)', Date.now(), function () {
      const executionID = this.lastID;

      const benchmarker = spawn('/opt/go/bin/benchmarker', [
        '-t', `http://${ip}/`,
        '-u', '/opt/go/src/github.com/catatsuy/private-isu/benchmarker/userdata',
      ]);

      benchmarker.stdout.pipe(concat((data) => {
        const result = JSON.parse(data);

        db.run('UPDATE executions SET status = 1, score = $score, result = $result WHERE id = $id', {
          $score: result.score,
          $result: data.toString(),
          $id: executionID,
        });
      }));

      res.redirect('/');
    });
  }
});

module.exports = router;
