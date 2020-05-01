const init = (() => {
  if (!lock) {
    throw new Error("Unable to find global lock library.");
  }
  if (!rxjs) {
    throw new Error("Unable to find global rxjs library.");
  }

  const { map, merge, skip, withLatestFrom } = rxjs.operators;
  const { fromEvent } = rxjs;
  const {
    getNewCombination,
    createRotationStream,
    createNumberStream,
    createDirectionStream,
    createResetStream,
    createUnlockedStream
  } = lock;

  function getOriginCoordinates(element) {
    const bounding = element.getBoundingClientRect();
    return {
      x: bounding.x + bounding.width / 2,
      y: bounding.y + bounding.height / 2
    };
  }

  function mapMouseEventToCoordinate(mouseEvent) {
    mouseEvent.preventDefault();
    return {
      x: mouseEvent.clientX,
      y: mouseEvent.clientY
    };
  }

  function mapTouchEventToCoordinate(touchEvent) {
    touchEvent.preventDefault();
    return {
      x: touchEvent.changedTouches[0].clientX,
      y: touchEvent.changedTouches[0].clientY
    };
  }

  function toggleInstructions(expandIconElement, metaElement, instructionsElement, lockContainerElement) {
    const isExpanded = metaElement.classList.contains("meta--expanded");
    if (isExpanded) {
      expandIconElement.classList.add("meta-expandIcon--down");
      expandIconElement.classList.remove("meta-expandIcon--up");
      metaElement.classList.remove("meta--expanded");
      instructionsElement.classList.add("meta-instructions--hidden");
      instructionsElement.classList.remove("meta-instructions--visible");
      lockContainerElement.classList.remove("lock-container--hidden");
    } else {
      expandIconElement.classList.add("meta-expandIcon--up");
      expandIconElement.classList.remove("meta-expandIcon--down");
      metaElement.classList.add("meta--expanded");
      instructionsElement.classList.add("meta-instructions--visible");
      instructionsElement.classList.remove("meta-instructions--hidden");
      lockContainerElement.classList.add("lock-container--hidden");
    }
  }

  function toggleLockHandle(lockContainerElement, handleElement, isUnlocked) {
    if (isUnlocked) {
      if (lockContainerElement.classList.contains("lock-container--unlocked")) {
        handleElement.classList.add("lock-handle--closed");
        lockContainerElement.classList.remove("lock-container--unlocked");
      } else {
        handleElement.classList.add("lock-handle--open");
        lockContainerElement.classList.add("lock-container--unlocked");
      }
    } else {
      handleElement.classList.add("lock-handle--closed");
      lockContainerElement.classList.remove("lock-container--unlocked");
    }
  }

  function onReset(lockDialElement) {
    lockDialElement.classList.add("lock-dial--reset");
  }

  function initializeCombinationLock() {
    const tickCount = 40;

    const lockContainerElement = document.getElementById("lock-container");
    const lockDialElement = document.getElementById("lock-dial");
    const handleElement = document.getElementById("lock-handle");
    const spinnerElement = document.getElementById("lock-spinner");
    const solutionElement = document.getElementById("meta-solution");
    const metaElement = document.getElementById("meta");
    const expandElement = document.getElementById("meta-expand");
    const expandIconElement = document.getElementById("meta-expandIcon");
    const toggleInstructionsElement = document.getElementById("meta-toggleInstructions");
    const instructionsElement = document.getElementById("meta-instructions");

    const mouseDownStream = fromEvent(lockContainerElement, "mousedown").pipe(map(mapMouseEventToCoordinate));
    const mouseUpStream = fromEvent(lockContainerElement, "mouseup").pipe(map(mapMouseEventToCoordinate));
    const mouseMoveStream = fromEvent(lockContainerElement, "mousemove").pipe(map(mapMouseEventToCoordinate));
    const touchStartStream = fromEvent(lockContainerElement, "touchstart").pipe(map(mapTouchEventToCoordinate));
    const touchEndStream = fromEvent(lockContainerElement, "touchend").pipe(map(mapTouchEventToCoordinate));
    const touchMoveStream = fromEvent(lockContainerElement, "touchmove").pipe(map(mapTouchEventToCoordinate));
    const handleClickStream = fromEvent(handleElement, "click");
    const handleTouchEndStream = fromEvent(handleElement, "touchend");
    const toggleInstructionsStream = fromEvent(toggleInstructionsElement, "click");
    const toggleExpandStream = fromEvent(expandElement, "click");

    const handleStream = handleClickStream.pipe(merge(handleTouchEndStream));
    const moveStartStream = mouseDownStream.pipe(merge(touchStartStream));
    const moveEndStream = mouseUpStream.pipe(merge(touchEndStream));
    const moveStream = mouseMoveStream.pipe(merge(touchMoveStream));

    const combination = getNewCombination(tickCount);
    solutionElement.innerHTML = combination.join(" • ");

    const rotationStream = createRotationStream(
      () => getOriginCoordinates(spinnerElement),
      moveStartStream,
      moveEndStream,
      moveStream,
      tickCount
    );
    const numberStream = createNumberStream(rotationStream, tickCount);
    const directionStream = createDirectionStream(numberStream, tickCount);
    const resetStream = createResetStream(numberStream, directionStream);
    const unlockedStream = createUnlockedStream(resetStream, numberStream, directionStream, combination);

    handleElement.addEventListener(
      "webkitAnimationEnd",
      () => {
        handleElement.classList.remove("lock-handle--closed");
        handleElement.classList.remove("lock-handle--open");
      },
      false
    );

    lockDialElement.addEventListener(
      "webkitAnimationEnd",
      () => lockDialElement.classList.remove("lock-dial--reset"),
      false
    );

    handleStream
      .pipe(withLatestFrom(unlockedStream))
      .subscribe(([_, isUnlocked]) => toggleLockHandle(lockContainerElement, handleElement, isUnlocked));

    rotationStream.subscribe(newRotation => {
      spinnerElement.setAttribute("transform", `rotate(${newRotation})`);
    });

    toggleInstructionsStream
      .pipe(merge(toggleExpandStream))
      .subscribe(() => toggleInstructions(expandIconElement, metaElement, instructionsElement, lockContainerElement));
    resetStream.pipe(skip(1)).subscribe(() => onReset(lockDialElement)); // skip first reset on initial load

    // debug output
    numberStream.subscribe(number => console.log("Number", number));
    directionStream.subscribe(direction => console.log("Direction", direction));
    resetStream.subscribe(() => console.log("Reset"));
    unlockedStream.subscribe(unlocked => console.log(unlocked ? "Unlocked!" : "Locked"));
  }

  return initializeCombinationLock;
})();
