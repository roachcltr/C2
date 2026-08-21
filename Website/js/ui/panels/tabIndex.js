export class SidebarTabs {
    constructor() {
        this.tabsContainer = document.querySelector('.sidebar-tabs-vertical');
        this.sidebar = document.getElementById('left-sidebar'); 
        
        if (!this.tabsContainer || !this.sidebar) return;
        this.init();
    }

    init() {
        // Eksekusi klik pada tombol Tab (Map/Entities/Hardware/System)
        this.tabsContainer.addEventListener('click', (e) => {
            const clickedTab = e.target.closest('.tab-btn');
            if (!clickedTab) return;

            const isAlreadyActive = clickedTab.classList.contains('active');
            const isCollapsed = this.sidebar.classList.contains('collapsed');

            // Klik tab yang sedang aktif SAAT sidebar terbuka -> tutup sidebar
            if (isAlreadyActive && !isCollapsed) {
                this.sidebar.classList.add('collapsed');
                document.querySelectorAll('.sidebar-tabs-vertical .tab-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                return;
            }

            // Selain itu, pastikan sidebar terbuka
            this.sidebar.classList.remove('collapsed');
            
            // Ganti panel hanya jika tab yang diklik belum aktif
            if (!isAlreadyActive) {
                this.switchTab(clickedTab);
            }
        });
    }

    switchTab(activeTab) {
        const targetId = activeTab.getAttribute('data-target');

        // Reset semua tombol tab jadi pasif
        document.querySelectorAll('.sidebar-tabs-vertical .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Sembunyikan semua konten panel
        document.querySelectorAll('#sidebar-content .sidebar-section').forEach(panel => {
            panel.classList.remove('active');
            panel.classList.add('hidden');
        });

        // Aktifkan tab yang baru
        activeTab.classList.add('active');
        document.getElementById(targetId)?.classList.remove('hidden');
        document.getElementById(targetId)?.classList.add('active');
    }
}