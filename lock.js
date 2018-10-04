const target = document.getElementById("combo");

const mousedown = rxjs.fromEvent(document, "mousedown");
const mouseup = rxjs.fromEvent(document, "mouseup");
const mousemove = rxjs.fromEvent(document, "mousemove");

const mousedrag = mousedown.pipe(
  rxjs.operators.flatMap(() => {
    return mousemove.pipe(rxjs.operators.takeUntil(mouseup));
  })
);

let currentRotation = 0;
const subscription = mousedrag.subscribe(() => {
  currentRotation++;
  target.setAttribute("transform", `rotate(${currentRotation})`);
});
