(function () {
    const KEY = "tc.study";
    const U = "80f6f0eb456f65c44c4740951b406b276387f2faa20169f67f3c2389b0cc187e";
    const P = "8372dac79d15f46be17cdddf25c087ae422465a91fb3cb0191d398484c4670f3";
    let fails = 0;
    let lockedUntil = 0;

    async function hex(value) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
        return Array.from(new Uint8Array(buf)).map(function (b) {
            return b.toString(16).padStart(2, "0");
        }).join("");
    }

    function same(a, b) {
        if (a.length !== b.length) return false;
        let n = 0;
        for (let i = 0; i < a.length; i += 1) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
        return n === 0;
    }

    function isOpen() {
        try {
            return sessionStorage.getItem(KEY) === "ok";
        } catch (err) {
            return false;
        }
    }

    function markOpen() {
        try {
            sessionStorage.setItem(KEY, "ok");
        } catch (err) { /* private mode */ }
    }

    function ensureModal() {
        let modal = document.getElementById("study-modal");
        if (modal) return modal;
        modal = document.createElement("div");
        modal.id = "study-modal";
        modal.className = "study-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "study-title");
        modal.innerHTML =
            '<form class="study-card" id="study-form" autocomplete="off">' +
            '<p class="study-kicker">Private room</p>' +
            '<h2 id="study-title">The Study</h2>' +
            '<label><span>Name</span><input id="study-user" name="study-user" type="text" required spellcheck="false"></label>' +
            '<label><span>Word</span><input id="study-pass" name="study-pass" type="password" required></label>' +
            '<p class="study-error" id="study-error"></p>' +
            '<div class="study-actions">' +
            '<button type="button" class="study-cancel" id="study-cancel">Leave</button>' +
            '<button type="submit" class="study-submit">Enter</button>' +
            "</div></form>";
        document.body.appendChild(modal);
        return modal;
    }

    function closeModal() {
        const modal = document.getElementById("study-modal");
        if (!modal || modal.classList.contains("is-required")) return;
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
    }

    function openModal(options) {
        const opts = options || {};
        const modal = ensureModal();
        const error = document.getElementById("study-error");
        modal.classList.toggle("is-required", Boolean(opts.required));
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        error.textContent = "";
        const user = document.getElementById("study-user");
        if (user) user.focus();
        modal._onSuccess = opts.onSuccess;
    }

    document.addEventListener("submit", async function (event) {
        if (event.target.id !== "study-form") return;
        event.preventDefault();
        const error = document.getElementById("study-error");
        if (Date.now() < lockedUntil) {
            error.textContent = "Wait a moment, then try again.";
            return;
        }
        const name = String(document.getElementById("study-user").value || "").trim();
        const word = String(document.getElementById("study-pass").value || "");
        const [uh, ph] = await Promise.all([hex(name), hex(word)]);
        if (same(uh, U) && same(ph, P)) {
            markOpen();
            fails = 0;
            const done = document.getElementById("study-modal")._onSuccess;
            closeModal();
            document.getElementById("study-modal").classList.remove("is-open");
            if (typeof done === "function") done();
            return;
        }
        fails += 1;
        error.textContent = "That name and word do not open this door.";
        if (fails >= 6) {
            lockedUntil = Date.now() + 20000;
            error.textContent = "The lock is set for a short rest.";
        }
    });

    document.addEventListener("click", function (event) {
        const modal = document.getElementById("study-modal");
        if (!modal || !modal.classList.contains("is-open")) return;
        if (event.target.id === "study-cancel" || event.target === modal) closeModal();
    });

    document.addEventListener("keydown", function (event) {
        const modal = document.getElementById("study-modal");
        if (event.key === "Escape" && modal && modal.classList.contains("is-open")) closeModal();
        if (event.altKey && event.shiftKey && (event.key === "A" || event.key === "a")) {
            event.preventDefault();
            const go = window.TalonStudy && window.TalonStudy.afterUnlock;
            openModal({ onSuccess: go });
        }
    });

    window.TalonStudy = {
        KEY: KEY,
        isOpen: isOpen,
        openModal: openModal,
        afterHome: function () {
            window.location.href = "admin/";
        }
    };
    window.TalonStudy.afterUnlock = window.TalonStudy.afterHome;
})();
