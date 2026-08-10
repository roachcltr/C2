// js/ui/panels/tabMap.js

export function initMapPanels() {
    // ==========================================
    // LEFT SIDEBAR TOGGLE
    // ==========================================
    const sidebar = document.getElementById('left-sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    let toggled = false;
    if (sidebar && sidebarToggle) {
        const sideIcon = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-icon lucide-map"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg> `;
        const notsideIcon = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-minus-icon lucide-map-minus"><path d="m11 19-1.106-.552a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0l4.212 2.106a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619V14"/><path d="M15 5.764V14"/><path d="M21 18h-6"/><path d="M9 3.236v15"/></svg>`;
        sidebarToggle.innerHTML = sideIcon;
        sidebarToggle.addEventListener('click', () => {
            if (toggled) {
                sidebarToggle.innerHTML = sideIcon;
                toggled = false;
            } else {
                sidebarToggle.innerHTML = notsideIcon;
                toggled = true;
            }
            sidebar.classList.toggle('collapsed');
        });
    }

    // ==========================================
    // INNER PANEL COLLAPSERS (Dropdown Arrows)
    // ==========================================
    const collapseBtns = document.querySelectorAll('.collapse-toggle-btn');

    collapseBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Find which panel this button controls
            const targetId = btn.getAttribute('data-target');
            const targetPanel = document.getElementById(targetId);

            if (targetPanel) {
                // Toggle the CSS classes
                targetPanel.classList.toggle('collapsed');
                btn.classList.toggle('closed');
            }
        });
    });

    // ==========================================
    // ALL SLIDERS TOOLTIP LOGIC
    // ==========================================
    const sliders = document.querySelectorAll('.tactical-slider');
    
    sliders.forEach(slider => {
        // Cari elemen tooltip melayang yang satu grup (parent) dengan slider ini
        const tooltip = slider.parentElement.querySelector('.slider-tooltip');
        
        if (tooltip) {
            const updateTooltip = () => {
                const val = Number(slider.value);
                const min = Number(slider.min) || 0;
                const max = Number(slider.max) || 100;
                
                // Format teks tooltip: jika max 2 (opacity), jadikan persen. Jika ribuan, jadikan meter.
                let displayVal = val;
                if (max <= 2) {
                    displayVal = Math.round(val * 100) + '%';
                } else {
                    displayVal = val + 'm';
                }
                
                tooltip.innerText = displayVal;
                
                // Jika ini adalah slider Topo, update juga angka statis di sebelah kanannya
                if (slider.id === 'topo-max-elev') {
                    const topoValDisplay = document.getElementById('topo-val-display');
                    if (topoValDisplay) topoValDisplay.innerText = displayVal;
                }
                
                // Posisikan gelembung mengikuti bulatan
                const percent = ((val - min) / (max - min)) * 100;
                const offset = (50 - percent) * 0.12;
                tooltip.style.left = `calc(${percent}% + ${offset}px)`;
            };

            // Init pertama kali
            updateTooltip();

            // Event listeners
            slider.addEventListener('mouseenter', () => { updateTooltip(); tooltip.classList.add('show'); });
            slider.addEventListener('mousemove', () => { updateTooltip(); tooltip.classList.add('show'); });
            slider.addEventListener('input', () => { updateTooltip(); tooltip.classList.add('show'); });
            slider.addEventListener('change', updateTooltip);
            
            slider.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
            slider.addEventListener('blur', () => tooltip.classList.remove('show'));
        }
    });
}