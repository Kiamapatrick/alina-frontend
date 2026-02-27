/* ── Scroll progress bar ── */
const progressBar = document.getElementById('scrollProgress');
window.addEventListener('scroll', () => {
  const h = document.documentElement;
  const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
  progressBar.style.width = pct + '%';
}, { passive: true });

/* ── Smooth scroll for hero CTA ── */
document.querySelector('.hero-cinema__cta').addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('listings').scrollIntoView({ behavior: 'smooth' });
});

/* ── IntersectionObserver: reveal on scroll ── */
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(en => {
    if (en.isIntersecting) {
      en.target.classList.add('visible');
      revealObs.unobserve(en.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

revealObs.observe(document.getElementById('sectionHeader'));

/* ── Image helpers ── */
function imageSrcFromUnit(unit) {
  if (!unit || !unit.image) return '/img/placeholder.jpg';
  const img = unit.image;
  if (img.startsWith('http://') || img.startsWith('https://')) return img;
  if (img.startsWith('/')) return img;
  return img.startsWith('img/') ? '/' + img : '/img/' + img;
}

/* ── Card builder ── */
function createCard(unit) {
  const a = document.createElement('a');
  a.href = `booking.html?id=${unit._id}`;
  a.className = 'lux-card';

  a.innerHTML = `
        <div class="lux-card__img-wrap">
          <img class="lux-card__img" src="${imageSrcFromUnit(unit)}" alt="${unit.name || 'Rental'}" loading="lazy" />
          <div class="lux-card__veil"></div>
          <div class="lux-card__accent"></div>
        </div>
        <div class="lux-card__body">
          <span class="lux-card__location">${unit.location || 'Available Now'}</span>
          <h3 class="lux-card__name">${unit.name || 'Unnamed Unit'}</h3>
          <div class="lux-card__meta">
            <div class="lux-card__price">
              <strong>$${unit.pricePerNight || '35'}</strong> / night
            </div>
            <div class="lux-card__arrow">
              <svg viewBox="0 0 16 16">
                <line x1="2" y1="14" x2="14" y2="2"/>
                <polyline points="6,2 14,2 14,10"/>
              </svg>
            </div>
          </div>
        </div>
      `;

  return a;
}

/* ── Load units ── */
async function loadUnits() {
  const container = document.getElementById('unitsContainer');
  const empty = document.getElementById('unitsEmpty');
  const countEl = document.getElementById('unitCount');

  try {
    const API_BASE = window.location.hostname === "localhost"
      ? "http://localhost:5000"
      : "https://alina906vibes-backend.onrender.com";

    const res = await fetch(`${API_BASE}/units`);
    if (!res.ok) throw new Error('units fetch failed ' + res.status);
    const units = await res.json();

    container.innerHTML = '';

    if (!Array.isArray(units) || units.length === 0) {
      empty.style.display = 'block';
      countEl.textContent = '0 properties';
      return;
    }

    empty.style.display = 'none';
    countEl.textContent = `${units.length} ${units.length === 1 ? 'property' : 'properties'}`;

    units.forEach((u, i) => {
      const card = createCard(u);

      const col = document.createElement('div');
      col.className = 'luxury-col';
      col.appendChild(card);
      container.appendChild(col);

      // Stagger reveal
      setTimeout(() => revealObs.observe(card), i * 60);
    });

  } catch (err) {
    console.error('Failed to load units:', err);
    container.innerHTML = `
          <div style="grid-column:span 12; padding:4rem 0; text-align:center; font-family:'Poppins',sans-serif; color:#aaa; font-size:0.85rem; letter-spacing:0.08em;">
            UNABLE TO LOAD RENTALS
          </div>
        `;
  }
}

document.addEventListener('DOMContentLoaded', loadUnits);

