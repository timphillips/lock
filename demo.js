const initializeCombinationLock = (() => {
  if (!lock) {
    throw new Error("Unable to find global lock library.");
  }
  if (!rxjs) {
    throw new Error("Unable to find global rxjs library.");
  }

  const { map, merge, skip, withLatestFrom } = rxjs.operators;
  const { fromEvent } = rxjs;

  function getOriginCoordinates(element) {
    const bounding = element.getBoundingClientRect();
    return {
      x: bounding.x + bounding.width / 2,
      y: bounding.y + bounding.height / 2
    };
  }

  function mouseEventToCoordinate(mouseEvent) {
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

  function toggleInstructions(instructionsElement) {
    const isVisible = instructionsElement.classList.contains("meta-instructions--visible");
    if (isVisible) {
      instructionsElement.classList.add("meta-instructions--hidden");
      instructionsElement.classList.remove("meta-instructions--visible");
    } else {
      instructionsElement.classList.add("meta-instructions--visible");
      instructionsElement.classList.remove("meta-instructions--hidden");
    }
  }

  function toggleExpand(expandIconElement, metaElement, instructionsElement) {
    const isExpanded = expandIconElement.classList.contains("meta-expandIcon--up");
    if (isExpanded) {
      expandIconElement.classList.add("meta-expandIcon--down");
      expandIconElement.classList.remove("meta-expandIcon--up");
      metaElement.classList.remove("meta--expanded");
      instructionsElement.classList.add("meta-instructions--hidden");
      instructionsElement.classList.remove("meta-instructions--visible");
    } else {
      expandIconElement.classList.add("meta-expandIcon--up");
      expandIconElement.classList.remove("meta-expandIcon--down");
      metaElement.classList.add("meta--expanded");
      instructionsElement.classList.add("meta-instructions--visible");
      instructionsElement.classList.remove("meta-instructions--hidden");
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

    const mouseDownStream = fromEvent(lockContainerElement, "mousedown").pipe(map(mouseEventToCoordinate));
    const mouseUpStream = fromEvent(lockContainerElement, "mouseup").pipe(map(mouseEventToCoordinate));
    const mouseMoveStream = fromEvent(lockContainerElement, "mousemove").pipe(map(mouseEventToCoordinate));
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

    const combination = lock.getNewCombination(tickCount);
    solutionElement.innerHTML = combination.join(" • ");

    const rotationStream = lock.createRotationStream(
      () => getOriginCoordinates(spinnerElement),
      moveStartStream,
      moveEndStream,
      moveStream,
      tickCount
    );
    const numberStream = lock.createNumberStream(rotationStream, tickCount);
    const directionStream = lock.createDirectionStream(numberStream, tickCount);
    const resetStream = lock.createResetStream(numberStream, directionStream);
    const unlockedStream = lock.createUnlockedStream(resetStream, numberStream, directionStream, combination);

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

    toggleInstructionsStream.subscribe(() => toggleInstructions(instructionsElement));
    toggleExpandStream.subscribe(() => toggleExpand(expandIconElement, metaElement, instructionsElement));
    resetStream.pipe(skip(1)).subscribe(() => onReset(lockDialElement)); // skip first reset on initial load

    // debug output
    numberStream.subscribe(number => console.log("Number", number));
    directionStream.subscribe(direction => console.log("Direction", direction));
    resetStream.subscribe(() => console.log("Reset"));
    unlockedStream.subscribe(unlocked => console.log(unlocked ? "Unlocked!" : "Locked"));
  }

  return initializeCombinationLock;
})();
