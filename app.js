
// Configuração de Conexão com o Supabase
const SUPABASE_URL = 'https://enjfjdrfkilbwilqehik.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuamZqZHJma2lsYndpbHFlaGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNDMwODQsImV4cCI6MjEwMjcxOTA4NH0.vq1rrVcLqOO6z1IuMr_uH_tx5_VIXzRPZuPmuiosr9I';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Cache local temporário após busca do banco
let cadastros = [];
let pacotes = [];
let atendimentos = [];
let caixaLancamentos = [];

// NAVEGAÇÃO ENTRE ABAS
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`sec-${tabId}`).classList.add('active');
    event.currentTarget.classList.add('active');

    if(tabId === 'atendimentos') carregarDadosAtendimentos();
    if(tabId === 'caixa') carregarCaixa();
}

// 1. CARREGAR ATENDIMENTOS E PACOTES DO SUPABASE
async function carregarDadosAtendimentos() {
    // Buscar Atendimentos de Hoje
    const { data: dataAtend, error: errAtend } = await _supabase
        .from('atendimentos')
        .select(`
            id, servico, tipo, status, valor, data_entrada,
            pets ( nome, tutores ( nome ) )
        `)
        .order('data_entrada', { ascending: false });

    if (!errAtend) atendimentos = dataAtend || [];

    // Buscar Pacotes Ativos
    const { data: dataPkg, error: errPkg } = await _supabase
        .from('pacotes')
        .select(`
            id, quantidade_total, quantidade_usada, status,
            pets ( nome, tutores ( nome ) )
        `)
        .eq('status', 'ativo');

    if (!errPkg) pacotes = dataPkg || [];

    renderAtendimentos();
    renderPacotes();
}

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
        const petNome = item.pets ? item.pets.nome : 'Pet';
        const tutorNome = (item.pets && item.pets.tutores) ? item.pets.tutores.nome : 'Tutor';
        const hora = new Date(item.data_entrada).toLocaleTimeString([], { hour: '2-2-digit', minute: '2-2-digit' });

        list.innerHTML += `
            <div class="service-item">
                <div class="pet-info">
                    <div class="pet-icon"><i class="fa-solid fa-dog"></i></div>
                    <div>
                        <strong>${petNome}</strong> <small>(${tutorNome})</small>
                        <p style="font-size:11px; color:#666;">${item.servico} • ${hora}</p>
                    </div>
                </div>
                <span class="badge ${isPkg ? 'badge-pacote' : 'badge-avulso'}">
                    ${isPkg ? 'Pacote' : 'R$ ' + parseFloat(item.valor).toFixed(2)}
                </span>
            </div>
        `;
    });
}

function renderPacotes() {
    const list = document.getElementById('packageList');
    list.innerHTML = '';

    if(pacotes.length === 0) {
        list.innerHTML = `<p style="text-align:center; color:#888; padding:15px;">Nenhum pacote ativo.</p>`;
        return;
    }

    pacotes.forEach(pkg => {
        const restante = pkg.quantidade_total - pkg.quantidade_usada;
        const pct = (pkg.quantidade_usada / pkg.quantidade_total) * 100;
        const petNome = pkg.pets ? pkg.pets.nome : 'Pet';
        const tutorNome = (pkg.pets && pkg.pets.tutores) ? pkg.pets.tutores.nome : 'Tutor';

        list.innerHTML += `
            <div class="pkg-card">
                <div style="display:flex; justify-content:space-between; font-size:13px;">
                    <strong>${petNome} <small>(${tutorNome})</small></strong>
                    <span style="color:var(--purple-main); font-weight:600;">${restante} restantes</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                <small style="font-size:10px; color:#777;">${pkg.quantidade_usada} de ${pkg.quantidade_total} banhos utilizados</small>
            </div>
        `;
    });
}

// 2. CARREGAR CAIXA DO SUPABASE
async function carregarCaixa() {
    const { data, error } = await _supabase
        .from('caixa_lancamentos')
        .select('*')
        .order('data_lancamento', { ascending: false });

    if(!error) caixaLancamentos = data || [];
    renderCaixa();
}

function renderCaixa() {
    const list = document.getElementById('caixaLancamentos');
    list.innerHTML = '';
    
    let total = 0, pix = 0, outros = 0;

    caixaLancamentos.forEach(c => {
        const v = parseFloat(c.valor);
        total += v;
        if(c.forma_pagamento === 'PIX') pix += v;
        else outros += v;

        list.innerHTML += `
            <div class="service-item">
                <div>
                    <strong>${c.descricao}</strong>
                    <p style="font-size:11px; color:#666;">Forma de Pagamento: ${c.forma_pagamento}</p>
                </div>
                <strong style="color:var(--green-badge);">+ R$ ${v.toFixed(2)}</strong>
            </div>
        `;
    });

    document.getElementById('caixaTotal').innerText = `R$ ${total.toFixed(2)}`;
    document.getElementById('caixaPix').innerText = `R$ ${pix.toFixed(2)}`;
    document.getElementById('caixaOutros').innerText = `R$ ${outros.toFixed(2)}`;
}

// 3. POPULAR SELECTS NOS MODAIS
async function populateSelects() {
    const selCheckin = document.getElementById('selectPetCheckin');
    const selPacote = document.getElementById('selectPetPacote');
    selCheckin.innerHTML = ''; selPacote.innerHTML = '';

    const { data, error } = await _supabase
        .from('pets')
        .select(`id, nome, tutores ( nome )`);

    if(!error && data) {
        cadastros = data;
        data.forEach(p => {
            const tutorNome = p.tutores ? p.tutores.nome : '';
            const opt = `<option value="${p.id}">${p.nome} (${tutorNome})</option>`;
            selCheckin.innerHTML += opt;
            selPacote.innerHTML += opt;
        });
    }
}

// MODAIS
function openModal(id) {
    populateSelects();
    document.getElementById(id).style.display = 'flex';
}
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// 4. SALVAR CADASTRO NO SUPABASE
async function salvarCadastro(e) {
    e.preventDefault();
    const tutorNome = document.getElementById('cadTutorNome').value;
    const tutorFone = document.getElementById('cadTutorFone').value;
    const petNome = document.getElementById('cadPetNome').value;
    const petRaca = document.getElementById('cadPetRaca').value;
    const petObs = document.getElementById('cadPetObs').value;

    // Inserir Tutor
    const { data: tutorData, error: errTutor } = await _supabase
        .from('tutores')
        .insert([{ nome: tutorNome, telefone: tutorFone }])
        .select();

    if (errTutor) { 
        alert('Erro ao cadastrar tutor: ' + errTutor.message); 
        console.error(errTutor);
        return; 
    }

    // Inserir Pet
    const { error: errPet } = await _supabase
        .from('pets')
        .insert([{
            tutor_id: tutorData[0].id,
            nome: petNome,
            raca_porte: petRaca,
            observacoes: petObs
        }]);

    if (errPet) { 
        alert('Erro ao cadastrar pet: ' + errPet.message); 
        console.error(errPet);
        return; 
    }

    alert('Tutor e Pet cadastrados no banco com sucesso!');
    document.getElementById('formCadastro').reset();
    switchTab('atendimentos');
}

// 5. SALVAR CHECK-IN NO SUPABASE
async function salvarCheckin() {
    const petId = parseInt(document.getElementById('selectPetCheckin').value);
    const tipo = document.getElementById('selectTipoCobranca').value;
    const servico = document.getElementById('selectServico').value;
    const valor = tipo === 'avulso' ? parseFloat(document.getElementById('valorAvulso').value) : 0;

    if(tipo === 'pacote') {
        const { data: pkgData } = await _supabase
            .from('pacotes')
            .select('*')
            .eq('pet_id', petId)
            .eq('status', 'ativo')
            .single();

        if(!pkgData || pkgData.quantidade_usada >= pkgData.quantidade_total) {
            alert('Este pet não possui pacote ativo com saldo!');
            return;
        }

        const novaQtd = pkgData.quantidade_usada + 1;
        const statusNovo = novaQtd >= pkgData.quantidade_total ? 'finalizado' : 'ativo';

        await _supabase
            .from('pacotes')
            .update({ quantidade_usada: novaQtd, status: statusNovo })
            .eq('id', pkgData.id);
    } else {
        const petObj = cadastros.find(p => p.id === petId);
        await _supabase
            .from('caixa_lancamentos')
            .insert([{
                descricao: `Atendimento Avulso - ${petObj ? petObj.nome : ''}`,
                forma_pagamento: "PIX",
                valor: valor
            }]);
    }

    await _supabase
        .from('atendimentos')
        .insert([{
            pet_id: petId,
            servico: servico,
            tipo: tipo,
            status: 'em_andamento',
            valor: valor
        }]);

    closeModal('modalAtendimento');
    carregarDadosAtendimentos();
}

// 6. SALVAR VENDA DE PACOTE NO SUPABASE
async function salvarVendaPacote() {
    const petId = parseInt(document.getElementById('selectPetPacote').value);
    const qtd = parseInt(document.getElementById('qtdBanhosPacote').value);
    const valor = parseFloat(document.getElementById('valorPacote').value);
    const forma = document.getElementById('pagamentoPacote').value;
    const petObj = cadastros.find(p => p.id === petId);

    // Criar Pacote
    await _supabase
        .from('pacotes')
        .insert([{
            pet_id: petId,
            quantidade_total: qtd,
            quantidade_usada: 0,
            status: 'ativo'
        }]);

    // Lançar no Caixa
    await _supabase
        .from('caixa_lancamentos')
        .insert([{
            descricao: `Venda Pacote (${qtd} Banhos) - ${petObj ? petObj.nome : ''}`,
            forma_pagamento: forma,
            valor: valor
        }]);

    closeModal('modalPacote');
    alert('Pacote cadastrado e lançado no caixa!');
    carregarDadosAtendimentos();
}

function filterServices(tipo, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAtendimentos(tipo);
}

// INICIALIZAÇÃO
carregarDadosAtendimentos();
