(() => {
  const overlay = document.getElementById("clipOverlay");
  const stage = document.getElementById("clipStage");
  const title = document.getElementById("clipTitle");
  const copy = document.getElementById("clipCopy");
  if (!overlay || !stage || !title || !copy) return;

  let closeTimer = null;
  const references = "../assets/animation-reference";

  const phaseLabels = (labels) => `
    <div class="tc-phase-labels" aria-hidden="true">
      ${labels.map((label) => `<span>${label}</span>`).join("")}
    </div>`;

  const verticalSequence = (file, className, effect = "") => `
    <div class="tc-photo-scene ${className}">
      <div class="tc-photo-frame">
        <img class="tc-photo-track" src="${references}/${file}" alt="" aria-hidden="true" />
        ${effect}
      </div>
      ${phaseLabels(["Before", "After"])}
    </div>`;

  const scenes = {
    whitening: {
      title: "Teeth Whitening",
      copy: "A controlled whitening treatment lifts discoloration while preserving the natural tooth shape.",
      visual: verticalSequence("whitening-before-after.jpg", "tc-whitening", '<div class="tc-light-sweep" aria-hidden="true"></div>'),
    },
    filling: {
      title: "Simple Composite Filling",
      copy: "Decay is removed and the cavity is restored with tooth-colored composite resin.",
      visual: `
        <div class="tc-photo-scene tc-filling">
          <div class="tc-photo-frame">
            <img class="tc-photo-track" src="${references}/filling-before-after.jpg" alt="" aria-hidden="true" />
            <div class="tc-focus-ring" aria-hidden="true"></div>
          </div>
          ${phaseLabels(["Before", "Restored"])}
        </div>`,
    },
    crown: {
      title: "Dental Crown",
      copy: "The damaged tooth is prepared, then covered by a custom crown that restores its shape and strength.",
      visual: `
        <div class="tc-photo-scene tc-crown">
          <div class="tc-photo-frame">
            <img class="tc-photo-track" src="${references}/crown-stages.jpg" alt="" aria-hidden="true" />
          </div>
          ${phaseLabels(["Before", "Prepared", "Crown"])}
        </div>`,
    },
    masseterBotox: {
      title: "Masseter Botox (Jaw Slimming)",
      copy: "A stronger jaw line softens into a slimmer lower-face contour.",
      visual: `
        <div class="tc-photo-scene tc-masseter">
          <div class="tc-masseter-frame">
            <img class="tc-masseter-photo tc-masseter-before" src="${references}/masseter-botox-face.png" alt="" aria-hidden="true" />
            <img class="tc-masseter-photo tc-masseter-after" src="${references}/masseter-botox-face.png" alt="" aria-hidden="true" />
            <div class="tc-masseter-soft-mask" aria-hidden="true"></div>
            <span class="tc-masseter-label tc-masseter-label-before">Before</span>
            <span class="tc-masseter-label tc-masseter-label-after">After</span>
            <span class="tc-masseter-arrow" aria-hidden="true"></span>
            <span class="tc-masseter-contour" aria-hidden="true"></span>
          </div>
        </div>`,
    },
    veneers: {
      title: "Veneers",
      copy: "Thin ceramic veneers refine the color, proportion, and alignment of the visible front teeth.",
      visual: verticalSequence("veneers-before-after.jpg", "tc-veneers", '<div class="tc-ceramic-sheen" aria-hidden="true"></div>'),
    },
    implants: {
      title: "Dental Implants",
      copy: "An implant replaces the missing tooth root and supports a natural-looking final crown.",
      visual: verticalSequence("implant-before-after.jpg", "tc-implants"),
    },
    allOnX: {
      title: "All on X",
      copy: "Multiple teeth supported by several implants to replace multiple missing teeth or the entire arch or mouth.",
      visual: verticalSequence("all-on-x-before-after.jpg", "tc-all-on-x", '<div class="tc-implant-pulse" aria-hidden="true"></div>'),
    },
    sureSmile: {
      title: "SureSmile Clear Aligners",
      copy: "Corrects misaligned teeth into natural, beautiful smile.",
      visual: `
        <div class="tc-photo-scene tc-suresmile">
          <div class="tc-suresmile-sequence">
            <div class="tc-suresmile-panel tc-suresmile-before" aria-hidden="true">
              <img src="${references}/suresmile-before.jpg" alt="" />
              <span>Before</span>
            </div>
            <div class="tc-suresmile-panel tc-suresmile-aligner" aria-hidden="true">
              <img src="${references}/suresmile-aligner.jpg" alt="" />
              <span>Aligner</span>
            </div>
            <div class="tc-suresmile-panel tc-suresmile-after" aria-hidden="true">
              <img src="${references}/suresmile-after.jpg" alt="" />
              <span>After</span>
            </div>
          </div>
        </div>`,
    },
  };

  const close = () => {
    overlay.classList.add("is-hidden");
    overlay.classList.remove("is-playing");
    window.clearTimeout(closeTimer);
  };

  const play = (key) => {
    const scene = scenes[key];
    if (!scene) return;
    window.clearTimeout(closeTimer);
    stage.innerHTML = `<div class="tc-scene" data-scene="${key}">${scene.visual}</div>`;
    title.textContent = scene.title;
    copy.textContent = scene.copy;
    overlay.classList.remove("is-hidden", "is-playing");
    void overlay.offsetWidth;
    overlay.classList.add("is-playing");
    closeTimer = window.setTimeout(close, 5000);
  };

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".clip-trigger[data-clip]");
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    play(trigger.dataset.clip);
  }, true);

  overlay.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  }, true);
})();