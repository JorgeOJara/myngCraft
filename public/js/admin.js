(() => {
  const passwordToggle = document.querySelector("[data-password-toggle]");
  if (passwordToggle) {
    passwordToggle.addEventListener("click", () => {
      const input = document.querySelector("#password");
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      passwordToggle.textContent = showing ? "Show" : "Hide";
      passwordToggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      input.focus();
    });
  }

  const photoInput = document.querySelector("[data-photo-input]");
  const photoPreview = document.querySelector("[data-photo-preview]");
  if (photoInput && photoPreview) {
    photoInput.addEventListener("change", () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      const image = document.createElement("img");
      image.alt = "New item photo preview";
      image.src = URL.createObjectURL(file);
      image.addEventListener("load", () => URL.revokeObjectURL(image.src), { once: true });
      photoPreview.replaceChildren(image);
      photoPreview.classList.add("has-image");
    });
  }

  document.querySelectorAll(".item-form, .settings-form").forEach((form) => {
    form.addEventListener("submit", () => {
      const button = form.querySelector("button[type='submit'].save-item-button");
      if (!button) return;
      button.disabled = true;
      button.textContent = "Saving…";
    });
  });
})();
