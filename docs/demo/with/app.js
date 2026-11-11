(function () {
  var trigger = document.querySelector("[data-qa='filter-trigger']");
  var popover = document.querySelector("[data-qa='popover']");
  var dialog = document.querySelector("[data-qa='dialog']");
  var openDialog = document.querySelector("[data-qa='open-dialog']");
  var dialogCancel = document.querySelector("[data-qa='dialog-cancel']");
  var dialogInput = document.querySelector("[data-qa='dialog-input']");

  if (!trigger || !popover || !dialog || !openDialog || !dialogCancel) return;

  function setMenu(open) {
    if (open) popover.removeAttribute("hidden");
    else popover.setAttribute("hidden", "");
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  trigger.addEventListener("click", function (event) {
    event.stopPropagation();
    setMenu(popover.hasAttribute("hidden"));
  });

  popover.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  var items = popover.querySelectorAll("[data-qa='popover-item']");
  for (var i = 0; i < items.length; i++) {
    items[i].addEventListener("click", function () {
      setMenu(false);
    });
  }

  document.addEventListener("click", function () {
    setMenu(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setMenu(false);
  });

  openDialog.addEventListener("click", function () {
    setMenu(false);
    dialog.showModal();
    if (dialogInput) dialogInput.focus();
  });

  dialogCancel.addEventListener("click", function () {
    dialog.close();
  });

  dialog.addEventListener("close", function () {
    openDialog.focus();
  });
})();
