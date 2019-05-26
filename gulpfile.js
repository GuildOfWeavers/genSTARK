'use strict';
// IMPORTS
// ================================================================================================
const gulp  = require('gulp');
const del   = require('del');
const exec  = require('child_process').exec;

// TASKS
// ================================================================================================
function clean(cb) {
  del(['bin']).then(() => { cb(); });
}

function compile(cb) {
  exec('tsc -p .', function (err, stdout, stderr) {
    if (stdout.length > 0) console.log(stdout);
    if (stderr.length > 0) console.error(stderr);
    cb(err);
  });
}

function copyFiles(cb) {
  gulp.src('./package.json').pipe(gulp.dest('./bin'));
  gulp.src('./package-lock.json').pipe(gulp.dest('./bin'));
  gulp.src('./genstark.d.ts').pipe(gulp.dest('./bin'));
  gulp.src('./.npmignore').pipe(gulp.dest('./bin'));
  gulp.src('./README.md').pipe(gulp.dest('./bin'));
  cb();
}

function publish(cb) {
  exec('npm publish bin --access=public', function (err, stdout, stderr) {
    if (stdout.length > 0) console.log(stdout);
    if (stderr.length > 0) console.error(stderr);
    cb(err);
  });
}

const build = gulp.series(clean, compile, copyFiles);

// EXPORTS
// ================================================================================================
exports.build = build;
exports.publish = gulp.series(build, publish);
exports.default = build;