(function () {
  "use strict";

  var trigger = document.querySelector("[data-qa='filter-trigger']");
  var menu = document.querySelector("[data-qa='popover']");
  var dialog = document.querySelector("[data-qa='dialog']");
  var openDialog = document.querySelector("[data-qa='open-dialog']");
  var cancelDialog = document.querySelector("[data-qa='dialog-cancel']");
  var inviteInput = document.querySelector("[data-qa='dialog-input']");
  var billingForm = document.querySelector("[data-qa='form']");
  var items = Array.prototype.slice.call(menu.querySelectorAll("[data-qa='popover-item']"));

  function isMenuOpen() {
    return !menu.hidden;
  }

  function closeMenu() {
    if (menu.hidden) {
      return;
    }
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  }

  function focusItem(index) {
    var next = (index + items.length) % items.length;
    items[next].focus();
  }

  trigger.addEventListener("click", function () {
    if (isMenuOpen()) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  trigger.addEventListener("keydown", function (event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu();
      focusItem(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
      focusItem(items.length - 1);
    }
  });

  items.forEach(function (item, index) {
    item.addEventListener("click", function () {
      items.forEach(function (other) {
        other.setAttribute("aria-checked", other === item ? "true" : "false");
      });
      closeMenu();
      trigger.focus();
    });

    item.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusItem(index + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusItem(index - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusItem(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusItem(items.length - 1);
      }
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || dialog.open || !isMenuOpen()) {
      return;
    }
    event.preventDefault();
    closeMenu();
    trigger.focus();
  });

  document.addEventListener("pointerdown", function (event) {
    if (!isMenuOpen()) {
      return;
    }
    var target = event.target;
    if (trigger.contains(target) || menu.contains(target)) {
      return;
    }
    closeMenu();
  });

  document.addEventListener("focusin", function (event) {
    if (!isMenuOpen()) {
      return;
    }
    var target = event.target;
    if (trigger.contains(target) || menu.contains(target)) {
      return;
    }
    closeMenu();
  });

  openDialog.addEventListener("click", function () {
    closeMenu();
    inviteInput.value = "";
    dialog.showModal();
  });

  cancelDialog.addEventListener("click", function () {
    dialog.close();
  });

  billingForm.addEventListener("submit", function (event) {
    event.preventDefault();
  });

  if (!("closedBy" in HTMLDialogElement.prototype)) {
    var pressedOutside = false;

    function outside(event) {
      var rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    }

    dialog.addEventListener("pointerdown", function (event) {
      pressedOutside = outside(event);
    });

    dialog.addEventListener("pointerup", function (event) {
      if (pressedOutside && outside(event)) {
        dialog.close();
      }
    });
  }
})();
