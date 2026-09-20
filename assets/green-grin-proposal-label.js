(function () {
  const eyebrow = document.querySelector(".eyebrow");
  if (!eyebrow || document.querySelector("#contract-label")) return;
  const label = document.createElement("span");
  label.id = "contract-label";
  label.textContent = "Service Agreement";
  const separator = document.createTextNode(" | ");
  if (eyebrow.firstChild) eyebrow.replaceChild(label, eyebrow.firstChild);
  eyebrow.insertBefore(separator, label.nextSibling);
})();
