(function () {
    function doorCopy() {
      return (window.SITE_COPY && window.SITE_COPY.parlor) || {};
    }

    function setMode(mode) {
      const isSignUp = mode === "signup";
      document.body.dataset.parlorMode = isSignUp ? "signup" : "signin";
      const copy = doorCopy();
      const title = document.getElementById("parlor-title");
      const blurb = document.getElementById("parlor-blurb");
      const submit = document.getElementById("parlor-submit");
      const signInTab = document.getElementById("tab-signin");
      const signUpTab = document.getElementById("tab-signup");
      const username = document.getElementById("parlor-username");
      if (title) title.textContent = isSignUp
        ? (copy.signup_title || "Sign the guest book")
        : (copy.signin_title || "Present your credentials");
      if (blurb) blurb.textContent = isSignUp
        ? (copy.signup_blurb || "Give a real email, a parlor username, and a word only you know. A likeness is optional. Then the parlor door opens.")
        : (copy.signin_blurb || "Members only beyond this door. Sign in with your email.");
      if (submit) submit.textContent = isSignUp
        ? (copy.signup_submit || "Create my membership")
        : (copy.signin_submit || "Enter the parlor");
    if (signInTab) {
      signInTab.classList.toggle("is-active", !isSignUp);
      signInTab.setAttribute("aria-selected", String(!isSignUp));
    }
    if (signUpTab) {
      signUpTab.classList.toggle("is-active", isSignUp);
      signUpTab.setAttribute("aria-selected", String(isSignUp));
    }
    if (username) username.required = isSignUp;
    const password = document.getElementById("parlor-password");
    if (password) password.autocomplete = isSignUp ? "new-password" : "current-password";
    const params = new URLSearchParams(location.search);
    params.set("mode", isSignUp ? "signup" : "signin");
    history.replaceState(null, "", location.pathname + "?" + params.toString());
  }

  async function parlorAttachSignupLikeness() {
    const input = document.getElementById("parlor-avatar");
    const file = input && input.files && input.files[0];
    if (!file) return;
    try {
      await window.parlorSaveAvatar(file);
    } catch (err) {
      console.warn(err);
    }
  }

  window.parlorBindAuthDoor = function () {
    const params = new URLSearchParams(location.search);
    const next = params.get("next") || "forum.html";
    const form = document.getElementById("parlor-auth-form");
    const errorEl = document.getElementById("form-error");
    const btn = document.getElementById("parlor-submit");
    if (!form) return;

    setMode(params.get("mode") === "signup" ? "signup" : "signin");
    document.addEventListener("sitecopy", function () {
      setMode(document.body.dataset.parlorMode === "signup" ? "signup" : "signin");
    });

    document.getElementById("tab-signin").addEventListener("click", function () {
      errorEl.textContent = "";
      setMode("signin");
    });
    document.getElementById("tab-signup").addEventListener("click", function () {
      errorEl.textContent = "";
      setMode("signup");
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      errorEl.textContent = "";
      errorEl.style.color = "#7f1d1d";
      const data = new FormData(form);
      const email = String(data.get("email") || "").trim().toLowerCase();
      const password = String(data.get("password") || "");
      const isSignUp = document.body.dataset.parlorMode === "signup";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorEl.textContent = "Enter a real email address.";
        return;
      }
      let username = "";
      if (isSignUp) {
        username = parlorNormalizeUsername(data.get("username"));
        if (email === String(window.PARLOR_ADMIN_EMAIL || "").toLowerCase()) {
          username = window.PARLOR_ADMIN_HANDLE;
        }
        if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
          errorEl.textContent = "Usernames use letters, numbers, dots, or dashes—no spaces.";
          return;
        }
      }
      btn.disabled = true;
      try {
        const client = parlorClient();
        if (isSignUp) {
          const { data: result, error } = await client.auth.signUp({
            email,
            password,
            options: {
              data: {
                username: username,
                display_name: username,
                name: username
              }
            }
          });
          if (error) throw error;
          if (result.session) {
            await parlorStampAdminIdentity(client, result.user || result.session.user);
            await parlorAttachSignupLikeness();
            location.replace("forum.html");
            return;
          }
          const { error: signInError } = await client.auth.signInWithPassword({ email, password });
          if (!signInError) {
            const { data: after } = await client.auth.getUser();
            await parlorStampAdminIdentity(client, after && after.user);
            await parlorAttachSignupLikeness();
            location.replace("forum.html");
            return;
          }
          errorEl.style.color = "#3f6212";
          errorEl.textContent = "The register is signed. If confirmation is required, finish that, then sign in with your email.";
          return;
        }
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: after } = await client.auth.getUser();
        await parlorStampAdminIdentity(client, after && after.user);
        location.replace(next === "forum.html" ? "forum.html" : "forum.html");
      } catch (err) {
        errorEl.textContent = err.message || "Those credentials were not recognized.";
      } finally {
        btn.disabled = false;
      }
    });
  };
})();
