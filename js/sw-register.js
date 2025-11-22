// --- Controlo de activação ---
const urlParams = new URLSearchParams(window.location.search);
const disableSwFlag = urlParams.has('disable-sw') || localStorage.getItem('radialAV:disableSW') === 'true';

if (urlParams.has('disable-sw')) {
    localStorage.setItem('radialAV:disableSW', 'true');
    console.warn('⚠️ Service Worker desativado via parâmetro de URL (disable-sw).');
} else if (urlParams.has('enable-sw')) {
    localStorage.removeItem('radialAV:disableSW');
    console.info('ℹ️ Service Worker reativado via parâmetro de URL (enable-sw).');
}

async function unregisterExistingServiceWorkers() {
    if (!('serviceWorker' in navigator)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) return;

    console.warn('⚠️ Desativando Service Worker (modo desenvolvimento).');
    await Promise.all(registrations.map(reg => reg.unregister()));
}

// Registrar Service Worker apenas quando permitido
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        if (disableSwFlag) {
            await unregisterExistingServiceWorkers();
            console.warn('⚠️ Service Worker não será registado porque disable-sw está activo.');
            return;
        }

        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('✅ Service Worker registrado com sucesso:', registration.scope);
                
                // Verificar atualizações
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // Novo Service Worker disponível
                            if (confirm('Nova versão disponível! Deseja atualizar?')) {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                                window.location.reload();
                            }
                        }
                    });
                });
            })
            .catch(error => {
                console.error('❌ Erro ao registrar Service Worker:', error);
            });
        
        // Recarregar quando o novo SW tomar controle
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        });
    });
} else {
    console.log('⚠️ Service Workers não são suportados neste navegador');
}

// Detectar se é PWA instalado
window.addEventListener('load', () => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
        console.log('✅ Executando como PWA instalado');
        document.body.classList.add('pwa-installed');
    }
});

// Prompt de instalação
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir o prompt automático
    e.preventDefault();
    deferredPrompt = e;
    
    // Mostrar botão de instalação customizado (opcional)
    console.log('💡 PWA pode ser instalado');
    
    // Você pode criar um botão customizado aqui
    showInstallPromotion();
});

function showInstallPromotion() {
    // Criar botão de instalação se não existir
    if (document.getElementById('install-button')) return;
    
    const installBtn = document.createElement('button');
    installBtn.id = 'install-button';
    installBtn.innerHTML = '📱 Instalar App';
    installBtn.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: #1e90ff;
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 25px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(30, 144, 255, 0.4);
        z-index: 1000;
        animation: pulse 2s infinite;
    `;
    
    installBtn.onclick = async () => {
        if (!deferredPrompt) return;
        
        // Mostrar prompt de instalação
        deferredPrompt.prompt();
        
        // Aguardar escolha do usuário
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            console.log('✅ PWA instalado pelo usuário');
        } else {
            console.log('❌ Usuário recusou instalação');
        }
        
        // Limpar prompt
        deferredPrompt = null;
        installBtn.remove();
    };
    
    document.body.appendChild(installBtn);
    
    // Remover botão após 10 segundos se não clicado
    setTimeout(() => {
        if (installBtn.parentNode) {
            installBtn.style.opacity = '0';
            setTimeout(() => installBtn.remove(), 300);
        }
    }, 10000);
}

// Adicionar animação de pulse via CSS
if (!document.getElementById('pwa-animations')) {
    const style = document.createElement('style');
    style.id = 'pwa-animations';
    style.textContent = `
        @keyframes pulse {
            0%, 100% {
                transform: scale(1);
            }
            50% {
                transform: scale(1.05);
            }
        }
        
        .pwa-installed {
            /* Estilos específicos para PWA instalado */
        }
    `;
    document.head.appendChild(style);
}
