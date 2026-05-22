/* Wraps every code block and adds a copy-to-clipboard button. */
(function () {
  var pres = document.querySelectorAll(".post-content pre");
  pres.forEach(function (pre) {
    var code = pre.querySelector("code");
    if (!code) return;

    var wrap = document.createElement("div");
    wrap.className = "code-block";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-button";
    btn.textContent = "Copy";
    btn.setAttribute("aria-label", "Copy code to clipboard");
    btn.addEventListener("click", function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(code.textContent).then(function () {
        btn.textContent = "Copied";
        btn.classList.add("is-copied");
        setTimeout(function () {
          btn.textContent = "Copy";
          btn.classList.remove("is-copied");
        }, 1800);
      });
    });
    wrap.appendChild(btn);
  });
})();
