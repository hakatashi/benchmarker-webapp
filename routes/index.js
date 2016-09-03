const {spawn} = require('child_process');
const concat = require('concat-stream');

const express = require('express');
const router = express.Router();

let executing = false;

/* GET home page. */
router.get('/', (req, res, next) => {
  res.render('index', { title: 'Express' });
});

router.post('/', (req, res, next) => {
  if (executing) {
    res.json({error: true});
  } else {
    const ip = process.env.WEBAPP_IP || '127.0.0.1';

    const benchmarker = spawn('/opt/go/bin/benchmarker', [
      '-t', `http://${ip}/`,
      '-u', '/opt/go/src/github.com/catatsuy/private-isu/benchmarker/userdata',
    ]);

    let result;

    benchmarker.stdout.pipe(concat((data) => {
      result = JSON.parse(data);
    }));

    benchmarker.on('close', (code) => {
      if (code !== 0) {
        res.json({error: true});
      } else {
        res.json({error: false, result});
      }
    });
  }
});

module.exports = router;
