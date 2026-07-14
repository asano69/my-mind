var e=`toast-style`;function t(){if(document.getElementById(e))return;let t=document.createElement(`style`);t.id=e,t.textContent=`
        @keyframes toast-in {
            from { translate: 0 0.5rem; }
            to   { translate: 0 0; }
        }
        .toast-el {
            position: fixed;
            bottom: var(--toast-bottom, 1.2rem);
            left: 50%;
            transform: translateX(-50%);
            background: var(--toast-bg, var(--color-hover));
            color: var(--toast-color, var(--color-text));
            padding: var(--toast-padding, 0.5rem 1rem);
            border-radius: var(--toast-radius, 8px);
            font-size: var(--toast-font-size, 20px);
            letter-spacing: var(--toast-letter-spacing, 0.05em);
            font-family: var(--toast-font-family, var(--font-sans));
            font-weight: var(--toast-font-weight, 400);
            box-shadow: var(--toast-shadow, var(--shadow-card));
            border: 1px solid rgba(255, 255, 255, 0.08);
            z-index: 9999;
            pointer-events: none;
            white-space: nowrap;
            animation: toast-in 180ms ease;
            transition: opacity 700ms ease var(--toast-linger, 2500ms);
            display: flex;
            align-items: baseline;
            gap: 0.5em;
        }
        /* Subject (map name etc.) — visually subordinate to the label */
				.toast-subject {
				    font-weight: 400;
				    font-size: 20px;
				    letter-spacing: 0.03em;
				    opacity: 0.85;
				}
    `,document.head.appendChild(t)}function n(e,n,r={}){t();let i=document.createElement(`div`);if(i.className=`toast-el`,n!==void 0){let t=document.createElement(`span`);t.textContent=e;let r=document.createElement(`span`);r.className=`toast-subject`,r.textContent=n,i.appendChild(t),i.appendChild(r)}else i.textContent=e;r.linger!==void 0&&i.style.setProperty(`--toast-linger`,`${r.linger}ms`),document.body.appendChild(i),requestAnimationFrame(()=>requestAnimationFrame(()=>{i.style.opacity=`0`,i.addEventListener(`transitionend`,()=>i.remove(),{once:!0})}))}export{n as showToast};