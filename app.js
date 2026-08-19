// Configuração de Conexão com o Supabase
const SUPABASE_URL = 'https://enjfjdrfkilbwilqehik.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuamZqZHJma2lsYndpbHFlaGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNDMwODQsImV4cCI6MjEwMjcxOTA4NH0.vq1rrVcLqOO6z1IuMr_uH_tx5_VIXzRPZuPmuiosr9I';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// Dados Iniciais em Memória (Estrutura do Banco)
let cadastros = [
    { id: 1, tutor: "Bob Soares", fone: "(61) 98888-1111", pet: "Thor", raca: "Poodle / Médio", obs: "Alergia a perfume" },
    { id: 2, tutor: "Maria Lima", fone: "(61) 99999-2222", pet: "Luna", raca: "Shihtzu / Pequeno", obs: "Dócil" }
];

let pacotes = [
    { id: 1, petId: 1, pet: "Thor", tutor: "Bob Soares", total: 4, usados: 2 }
];

let atendimentos = [
    { id: 1, pet: "Thor", tutor: "Bob Soares", servico: "Banho e Tosa", tipo: "pacote", hora: "09:30", valor: 0 },
    { id: 2, pet: "Luna", tutor: "Maria Lima", servico: "Somente Banho", tipo: "avulso", hora: "10:15", valor: 70 }
];

let caixaLancamentos = [
    { id: 1, descricao: "Venda Pacote - Thor (Bob Soares)", forma: "PIX", valor: 240 },
    { id: 2, descricao: "Atendimento Avulso - Luna (Maria)", forma: "PIX", valor: 70 }
];

// NAVEGAÇÃO ENTRE ABAS
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`sec-${tabId}`).classList.add('active');
    event.currentTarget.classList.add('active');

    if(tabId === 'caixa') renderCaixa();
}

// RENDERIZAR PAINÉIS
function renderAtendimentos(filter = 'todos') {
    const list = document.getElementById('serviceList');
    list.innerHTML = '';

    const filtered = filter === 'todos' ? atendimentos : atendimentos.filter(a => a.tipo === filter);

    if(filtered.length === 0) {
        list.innerHTML = `<p style="text-align:center; color:#888; padding:15px;">Nenhum atendimento registrado.</p>`;
        return;
    }

    filtered.forEach(item => {
        const isPkg = item.tipo === 'pacote';
        list.innerHTML += `
            <div class="service-item">
                <div class="pet-info">
                    <div class="pet-icon"><i class="fa-solid fa-dog"></i></div>
                    <div>
                        <strong>${item.pet}</strong> <small>(${item.tutor})</small>
                        <p style="font-size:11px; color:#666;">${item.servico} • ${item.hora}</p>
                    </div>
                </div>
                <span class="badge ${isPkg ? 'badge-pacote' : 'badge-avulso'}">
                    ${isPkg ? 'Pacote' : 'R$ ' + item.valor.toFixed(2)}
                </span>
            </div>
        `;
    });
}

function renderPacotes() {
    const list = document.getElementById('packageList');
    list.innerHTML = '';

    pacotes.forEach(pkg => {
        const restante = pkg.total - pkg.usados;
        const pct = (pkg.usados / pkg.total) * 100;
        list.innerHTML += `
            <div class="pkg-card">
                <div style="display:flex; justify-content:space-between; font-size:13px;">
                    <strong>${pkg.pet} <small>(${pkg.tutor})</small></strong>
                    <span style="color:var(--purple-main); font-weight:600;">${restante} restantes</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                <small style="font-size:10px; color:#777;">${pkg.usados} de ${pkg.total} banhos utilizados</small>
            </div>
        `;
    });
}

function renderCaixa() {
    const list = document.getElementById('caixaLancamentos');
    list.innerHTML = '';
    
    let total = 0, pix = 0, outros = 0;

    caixaLancamentos.forEach(c => {
        total += c.valor;
        if(c.forma === 'PIX') pix += c.valor;
        else outros += c.valor;

        list.innerHTML += `
            <div class="service-item">
                <div>
                    <strong>${c.descricao}</strong>
                    <p style="font-size:11px; color:#666;">Forma de Pagamento: ${c.forma}</p>
                </div>
                <strong style="color:var(--green-badge);">+ R$ ${c.valor.toFixed(2)}</strong>
            </div>
        `;
    });

    document.getElementById('caixaTotal').innerText = `R$ ${total.toFixed(2)}`;
    document.getElementById('caixaPix').innerText = `R$ ${pix.toFixed(2)}`;
    document.getElementById('caixaOutros').innerText = `R$ ${outros.toFixed(2)}`;
}

// POPULAR DROPDOWNS NOS MODAIS
function populateSelects() {
    const selCheckin = document.getElementById('selectPetCheckin');
    const selPacote = document.getElementById('selectPetPacote');
    selCheckin.innerHTML = ''; selPacote.innerHTML = '';

    cadastros.forEach(c => {
        const opt = `<option value="${c.id}">${c.pet} (${c.tutor})</option>`;
        selCheckin.innerHTML += opt;
        selPacote.innerHTML += opt;
    });
}

// MODAIS
function openModal(id) {
    populateSelects();
    document.getElementById(id).style.display = 'flex';
}
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// SALVAR NOVO CADASTRO
function salvarCadastro(e) {
    e.preventDefault();
    const novo = {
        id: Date.now(),
        tutor: document.getElementById('cadTutorNome').value,
        fone: document.getElementById('cadTutorFone').value,
        pet: document.getElementById('cadPetNome').value,
        raca: document.getElementById('cadPetRaca').value,
        obs: document.getElementById('cadPetObs').value
    };
    cadastros.push(novo);
    alert('Tutor e Pet cadastrados com sucesso!');
    document.getElementById('formCadastro').reset();
    switchTab('atendimentos');
}

// SALVAR CHECK-IN
function salvarCheckin() {
    const petId = parseInt(document.getElementById('selectPetCheckin').value);
    const itemCad = cadastros.find(c => c.id === petId);
    const tipo = document.getElementById('selectTipoCobranca').value;
    const servico = document.getElementById('selectServico').value;
    const valor = tipo === 'avulso' ? parseFloat(document.getElementById('valorAvulso').value) : 0;

    if(tipo === 'pacote') {
        let pkg = pacotes.find(p => p.petId === petId);
        if(!pkg || pkg.usados >= pkg.total) {
            alert('Este pet não possui pacote ativo com saldo!');
            return;
        }
        pkg.usados += 1;
    } else {
        caixaLancamentos.push({
            id: Date.now(),
            descricao: `Atendimento Avulso - ${itemCad.pet} (${itemCad.tutor})`,
            forma: "PIX",
            valor: valor
        });
    }

    atendimentos.unshift({
        id: Date.now(),
        pet: itemCad.pet,
        tutor: itemCad.tutor,
        servico: servico,
        tipo: tipo,
        hora: new Date().toLocaleTimeString([], { hour: '2-2-digit', minute: '2-2-digit' }),
        valor: valor
    });

    renderAtendimentos();
    renderPacotes();
    closeModal('modalAtendimento');
}

// SALVAR VENDA DE PACOTE
function salvarVendaPacote() {
    const petId = parseInt(document.getElementById('selectPetPacote').value);
    const itemCad = cadastros.find(c => c.id === petId);
    const qtd = parseInt(document.getElementById('qtdBanhosPacote').value);
    const valor = parseFloat(document.getElementById('valorPacote').value);
    const forma = document.getElementById('pagamentoPacote').value;

    pacotes.push({
        id: Date.now(),
        petId: petId,
        pet: itemCad.pet,
        tutor: itemCad.tutor,
        total: qtd,
        usados: 0
    });

    caixaLancamentos.push({
        id: Date.now(),
        descricao: `Venda Pacote (${qtd} Banhos) - ${itemCad.pet}`,
        forma: forma,
        valor: valor
    });

    renderPacotes();
    closeModal('modalPacote');
    alert('Pacote vendido e lançado no caixa!');
}

function filterServices(tipo, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAtendimentos(tipo);
}

// INICIALIZAÇÃO
renderAtendimentos();
renderPacotes();
