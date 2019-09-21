# Lock

An interactive single-dial combination lock built with [RxJS](https://rxjs-dev.firebaseapp.com/). Supports both touch and mouse interactions.

[Try it out!](http://lock.tim-phillips.com)

<p align="center">
  <img width="200" src="https://user-images.githubusercontent.com/2653039/65378721-64825d80-dcb4-11e9-81a9-c3857fff811b.gif" style="max-width: 100%; border: 1px solid #d9d9d9">
</p>

### How to Build and Run

This is a personal project to learn about RxJS. The only dependency is RxJS v6.3.3.

To keep things simple, the project does not use a package manager or a module bundler. Lock-related utilities are exported from [`lock.js`](https://github.com/timphillips/lock/blob/master/lock.js) using an old-school IIFE. The demo site is initialized in [`demo.js`](https://github.com/timphillips/lock/blob/master/demo.js).

Simply open [`index.html`](https://github.com/timphillips/lock/blob/master/index.html) in a web browser to run the demo.
