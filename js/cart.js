// js/cart.js
import { getCart, removeFromCart, clearCart as dataClearCart, computeCartTotal, getTrackPrice } from './data.js';
import { getSupabaseClient } from './supabase.js';

function qs(id){ return document.getElementById(id); }

function trackCoverHtml(track){
  if (track.coverUrl) return `<img src="${track.coverUrl}" alt="${track.title}" class="track-cover-img">`;
  return track.cover || '🎵';
}

export function updateCartBadge(){
  try{
    const badge = qs('cart-badge');
    const btn = qs('cart-open-btn');
    const items = getCart();
    const n = Array.isArray(items) ? items.length : 0;
    if (btn) btn.style.display = n > 0 ? '' : 'none';
    if (badge){
      if (n > 0){ badge.textContent = String(n); badge.style.display = 'inline-block'; }
      else { badge.textContent = '0'; badge.style.display = 'none'; }
    }
  }catch(_){/* noop */}
}

export function openCart(){
  const container = qs('cart-items');
  const items = getCart();
  const eur = (n) => `${n.toFixed(2).replace('.', ',')} €`;
  if (container){
    if (!items || items.length === 0){
      container.innerHTML = '<p class="text-center" style="color: var(--muted);">Carrinho vazio</p>';
    } else {
      const listHtml = items.map(t => `
        <div class="track-item">
          <div class="track-cover">${trackCoverHtml(t)}</div>
          <div class="track-info">
            <div class="track-title">${t.title}</div>
            <div class="track-artist">${t.artist}</div>
          </div>
          <div class="track-actions">
            <span style="margin-right:0.5rem; color: var(--muted);">${eur(getTrackPrice(t))}</span>
            <button class="action-btn" onclick="event.stopPropagation(); window.removeFromCartUI(${t.id})" title="Remover do carrinho">🗑️</button>
          </div>
        </div>
      `).join('');
      const total = computeCartTotal();
      const subtotal = items.reduce((s, t) => s + getTrackPrice(t), 0);
      const discount = Math.max(0, subtotal - total);
      const summaryHtml = [
        `<div style=\"display:flex; justify-content:flex-end; margin-top:0.5rem; gap:1rem; flex-wrap:wrap;\">`,
        `<div>Subtotal: <strong>${eur(subtotal)}</strong></div>`,
        (discount > 0.001 ? `<div>Bundle: <strong>−${eur(discount)}</strong></div>` : ``),
        `<div>Total: <strong>${eur(total)}</strong></div>`,
        `</div>`
      ].join('');
      container.innerHTML = listHtml + summaryHtml;
    }
  }
  if (window.openModal) window.openModal('cartModal'); else { const m = qs('cartModal'); if (m) m.style.display='flex'; }
}

export function removeFromCartUI(id){
  try { removeFromCart(id); } catch(_){ }
  updateCartBadge();
  openCart();
}

export function clearCart(){
  try { dataClearCart(); } catch(_){ }
  updateCartBadge();
  openCart();
}

export function proceedToCheckout(){
  // Preencher o resumo e abrir o modal de checkout
  try { openCheckout(); } catch(_){ }
}

export function openCheckout(){
  const container = qs('checkout-summary');
  const items = getCart();
  const eur = (n) => `${n.toFixed(2).replace('.', ',')} €`;
  if (container){
    if (!items || items.length === 0){
      container.innerHTML = '<p class="text-center" style="color: var(--muted);">Carrinho vazio</p>';
    } else {
      const listHtml = items.map(t => `
        <div class="track-item">
          <div class="track-cover">${trackCoverHtml(t)}</div>
          <div class="track-info">
            <div class="track-title">${t.title}</div>
            <div class="track-artist">${t.artist}</div>
          </div>
          <div class="track-actions">
            <span style="font-weight:600;">${eur(getTrackPrice(t))}</span>
          </div>
        </div>
      `).join('');
      const total = computeCartTotal();
      const subtotal = items.reduce((s, t) => s + getTrackPrice(t), 0);
      const discount = Math.max(0, subtotal - total);
      const summaryHtml = [
        `<div style="display:flex; justify-content:flex-end; margin-top:0.5rem; gap:1rem; flex-wrap:wrap;">`,
        `<div>Subtotal: <strong>${eur(subtotal)}</strong></div>`,
        (discount > 0.001 ? `<div>Bundle: <strong>−${eur(discount)}</strong></div>` : ``),
        `<div>Total: <strong>${eur(total)}</strong></div>`,
        `</div>`
      ].join('');
      container.innerHTML = listHtml + summaryHtml;
    }
  }
  if (window.closeModal) window.closeModal('cartModal'); else { const m = qs('cartModal'); if (m) m.style.display='none'; }
  if (window.openModal) window.openModal('checkoutModal'); else { const m = qs('checkoutModal'); if (m) m.style.display='flex'; }
}

export async function confirmCheckout(){
  const btn = document.querySelector('#checkoutModal .btn.btn-primary');
  try { if (btn) { btn.disabled = true; btn.textContent = 'A processar...'; } } catch(_){ }
  try {
    const items = getCart();
    if (!items || items.length === 0) {
      try { if (window.showToast) window.showToast('Carrinho vazio', 'info'); } catch(_){}
      return;
    }

    const trackDbIds = items.map(t => t && t.dbId).filter(Boolean);
    if (!trackDbIds.length) {
      try { if (window.showToast) window.showToast('Itens sem IDs válidos', 'error'); } catch(_){}
      return;
    }

    const supa = await getSupabaseClient();
    if (!supa) { try { if (window.showToast) window.showToast('Supabase indisponível', 'error'); } catch(_){}; return; }
    const { data: { session } } = await supa.auth.getSession();
    const token = session && session.access_token ? session.access_token : '';
    if (!token) { try { if (window.showToast) window.showToast('Inicia sessão para continuar', 'warning'); } catch(_){}; return; }

    const base = (typeof window !== 'undefined' && window.R2_API_URL) ? window.R2_API_URL : '';
    if (!base) { try { if (window.showToast) window.showToast('Worker API não configurada', 'error'); } catch(_){}; return; }

    const res = await fetch(`${base}/checkout/create-session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ trackDbIds })
    });
    if (!res.ok) {
      const txt = await res.text().catch(()=>'');
      try { if (window.showToast) window.showToast('Erro ao iniciar checkout', 'error'); } catch(_){}
      console.error('Checkout error:', res.status, txt);
      return;
    }
    const j = await res.json().catch(()=>null);
    if (!j || !j.url) { try { if (window.showToast) window.showToast('Resposta inválida do checkout', 'error'); } catch(_){}; return; }

    // Redirecionar para Stripe
    window.location.href = j.url;
  } catch (e) {
    console.error('confirmCheckout error:', e);
    try { if (window.showToast) window.showToast('Falha no checkout', 'error'); } catch(_){}
  } finally {
    try { if (btn) { btn.disabled = false; btn.textContent = 'Confirmar compra'; } } catch(_){}
  }
}

(function init(){
  const btn = qs('cart-open-btn');
  if (btn) btn.addEventListener('click', openCart);
  updateCartBadge();

  // expor globais para onclicks inline
  window.updateCartBadge = updateCartBadge;
  window.openCart = openCart;
  window.removeFromCartUI = removeFromCartUI;
  window.clearCart = clearCart;
  window.proceedToCheckout = proceedToCheckout;
  window.openCheckout = openCheckout;
  window.confirmCheckout = confirmCheckout;
  try {
    const u = new URL(window.location.href);
    const st = u.searchParams.get('checkout');
    if (st === 'success') {
      try { if (window.showToast) window.showToast('Pagamento concluído. Obrigado!', 'success'); } catch(_){}
      try { dataClearCart(); } catch(_){}
      updateCartBadge();
      try { u.searchParams.delete('checkout'); history.replaceState({}, '', `${u.pathname}${u.hash || ''}`); } catch(_){}
    } else if (st === 'cancel') {
      try { if (window.showToast) window.showToast('Pagamento cancelado.', 'info'); } catch(_){}
      try { u.searchParams.delete('checkout'); history.replaceState({}, '', `${u.pathname}${u.hash || ''}`); } catch(_){}
    }
  } catch(_){}
})();
