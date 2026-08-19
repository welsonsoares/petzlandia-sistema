// Configuração de Conexão com o Supabase
const SUPABASE_URL = 'https://enjfjdrfkilbwilqehik.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuamZqZHJma2lsYndpbHFlaGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNDMwODQsImV4cCI6MjEwMjcxOTA4NH0.vq1rrVcLqOO6z1IuMr_uH_tx5_VIXzRPZuPmuiosr9I';

var _supabase = null;

function getSupabase() {
    if (!_supabase) {
        const globalSupabase = window.supabase || typeof supabase !== 'undefined' ? supabase : null;
        
        if (globalSupabase && typeof globalSupabase.createClient === 'function') {
            _supabase = globalSupabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        } else {
            console.error('SDK do Supabase ainda não carregou totalmente.');
            return null;
        }
    }
    return _supabase;
}

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
    if (event && event.currentTarget) event.currentTarget.classList.add('active');

    if (tabId === 'atendimentos') carregarDadosAtendimentos();
    if (tabId === 'caixa') carregarCaixa();
}

// 1. CARREGAR ATENDIMENTOS E PACOTES DO SUPABASE
async function carregarDadosAtendimentos() {
    try {
        const client = getSupabase();
        
        // Buscar Atendimentos de Hoje
        const { data: dataAtend, error: errAtend } = await client
            .from('atendimentos')
            .select(`
                id, servico, tipo, status, valor, data_entrada,
                pets ( nome, tutores ( nome ) )
            `)
            .order('data_entrada', { ascending: false });

        if (!errAtend) atendimentos = dataAtend || [];

        // Buscar Pacotes Ativos
        const { data: dataPkg, error: errPkg } = await client
            .from('pacotes')
            .select(`
                id, quantidade_total, quantidade_usada, status,
                pets ( nome, tutores ( nome ) )
            `)
            .eq('status', 'ativo');

        if (!errPkg) pacotes = dataPkg || [];

        renderAtendimentos();
        renderPacotes();
    } catch (e) {
        console.error('Erro ao carregar atendimentos:', e);
    }
}

function renderAtendimentos(filter = 'todos') {
    const list = document.getElementById('serviceList');
    if (!list) return;
    list.innerHTML = '';

    const filtered = filter === 'todos' ? atendimentos : atendimentos.filter(a => a.tipo === filter);

    if (filtered.length === 0) {
        list.innerHTML = `<p style="text-align:center; color:#888; padding:15px;">Nenhum atendimento registrado.</p>`;
        return;
    }

    filtered.forEach(item => {
        const isPkg = item.tipo === 'pacote';
        const petNome = item.pets ? item.pets.nome : 'Pet';
        const tutorNome = (item.pets && item.pets.tutores) ? item.pets.tutores.nome : 'Tutor';
        const hora = item.data_entrada ? new Date(item.data_entrada).toLocaleTimeString([], { hour: '2-2-digit', minute: '2-2-digit' }) : '--:--';

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
                    ${isPkg ? 'Pacote' : 'R$ ' + parseFloat(item.valor || 0).toFixed(2)}
                </span>
            </div>
        `;
    });
}

function renderPacotes() {
    const list = document.getElementById('packageList');
    if (!list) return;
    list.innerHTML = '';

    if (pacotes.length === 0) {
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
    try {
        const client = getSupabase();
        const { data, error } = await client
            .from('caixa_lancamentos')
            .select('*')
            .order('data_lancamento', { ascending: false });

        if (!error) caixaLancamentos = data || [];
        renderCaixa();
    } catch (e) {
        console.error('Erro ao carregar caixa:', e);
    }
}

function renderCaixa() {
    const list = document.getElementById('caixaLancamentos');
    if (!list) return;
    list.innerHTML = '';
    
    let total = 0, pix = 0, outros = 0;

    caixaLancamentos.forEach(c => {
        const v = parseFloat(c.valor || 0);
        total += v;
        if (c.forma_pagamento === 'PIX') pix += v;
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
    if (!selCheckin || !selPacote) return;
    selCheckin.innerHTML = ''; selPacote.innerHTML = '';

    try {
        const client = getSupabase();
        const { data, error } = await client
            .from('pets')
            .select(`id, nome, tutores ( nome )`);

        if (!error && data) {
            cadastros = data;
            data.forEach(p => {
                const tutorNome = p.tutores ? p.tutores.nome : '';
                const opt = `<option value="${p.id}">${p.nome} (${tutorNome})</option>`;
                selCheckin.innerHTML += opt;
                selPacote.innerHTML += opt;
            });
        }
    } catch (e) {
        console.error('Erro ao popular selects:', e);
    }
}

// ALTERNAR VISIBILIDADE DO CAMPO DE VALOR E FORMA DE PAGAMENTO NO CHECK-IN
function toggleValorAvulso() {
    const tipo = document.getElementById('selectTipoCobranca').value;
    const groupValor = document.getElementById('groupValorAvulso');
    const groupPagto = document.getElementById('groupFormaPagamentoAvulso');
    
    if (tipo === 'avulso') {
        if (groupValor) groupValor.style.display = 'block';
        if (groupPagto) groupPagto.style.display = 'block';
    } else {
        if (groupValor) groupValor.style.display = 'none';
        if (groupPagto) groupPagto.style.display = 'none';
    }
}

// MODAIS
function openModal(id) {
    populateSelects();
    if (id === 'modalAtendimento') toggleValorAvulso();
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// 4. SALVAR CADASTRO NO SUPABASE
async function salvarCadastro(e) {
    if (e) e.preventDefault();

    const tutorNome = document.getElementById('cadTutorNome').value.trim();
    const tutorFone = document.getElementById('cadTutorFone').value.trim();
    const petNome = document.getElementById('cadPetNome').value.trim();
    const petRaca = document.getElementById('cadPetRaca').value.trim();
    const petObs = document.getElementById('cadPetObs').value.trim();

    if (!tutorNome || !tutorFone || !petNome || !petRaca) {
        alert('Por favor, preencha todos os campos obrigatórios (*).');
        return;
    }

    try {
        const client = getSupabase();

        // 1. Inserir Tutor
        const { data: tutorData, error: errTutor } = await client
            .from('tutores')
            .insert([{ nome: tutorNome, telefone: tutorFone }])
            .select('*');

        if (errTutor) {
            alert('Erro ao cadastrar Tutor: ' + errTutor.message);
            console.error(errTutor);
            return;
        }

        if (!tutorData || tutorData.length === 0) {
            alert('Erro: Tutor gravado, mas ID não retornado pelo Supabase.');
            return;
        }

        const tutorId = tutorData[0].id;

        // 2. Inserir Pet
        const { error: errPet } = await client
            .from('pets')
            .insert([{
                tutor_id: tutorId,
                nome: petNome,
                raca_porte: petRaca,
                observacoes: petObs
            }]);

        if (errPet) {
            alert('Erro ao cadastrar Pet: ' + errPet.message);
            console.error(errPet);
            return;
        }

        alert('Tutor e Pet cadastrados com sucesso!');
        document.getElementById('formCadastro').reset();
        switchTab('atendimentos');

    } catch (err) {
        alert('Ocorreu um erro inesperado: ' + err.message);
        console.error(err);
    }
}

// 5. SALVAR CHECK-IN NO SUPABASE
async function salvarCheckin() {
    try {
        const client = getSupabase();
        const petId = parseInt(document.getElementById('selectPetCheckin').value);
        const tipo = document.getElementById('selectTipoCobranca').value;
        const servico = document.getElementById('selectServico').value;
        const valor = tipo === 'avulso' ? parseFloat(document.getElementById('valorAvulso').value) : 0;

        if (tipo === 'pacote') {
            const { data: pkgData } = await client
                .from('pacotes')
                .select('*')
                .eq('pet_id', petId)
                .eq('status', 'ativo')
                .single();

            if (!pkgData || pkgData.quantidade_usada >= pkgData.quantidade_total) {
                alert('Este pet não possui pacote ativo com saldo!');
                return;
            }

            const novaQtd = pkgData.quantidade_usada + 1;
            const statusNovo = novaQtd >= pkgData.quantidade_total ? 'finalizado' : 'ativo';

            await client
                .from('pacotes')
                .update({ quantidade_usada: novaQtd, status: statusNovo })
                .eq('id', pkgData.id);
        } else {
            const petObj = cadastros.find(p => p.id === petId);
            const pagtoInput = document.getElementById('pagamentoAvulso');
            await client
                .from('caixa_lancamentos')
                .insert([{
                    descricao: `Atendimento Avulso - ${petObj ? petObj.nome : ''}`,
                    forma_pagamento: pagtoInput ? pagtoInput.value : "PIX",
                    valor: valor
                }]);
        }

        await client
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
    } catch (e) {
        alert('Erro ao salvar check-in: ' + e.message);
    }
}

// 6. SALVAR VENDA DE PACOTE NO SUPABASE
async function salvarVendaPacote() {
    try {
        const client = getSupabase();
        const petId = parseInt(document.getElementById('selectPetPacote').value);
        const qtd = parseInt(document.getElementById('qtdBanhosPacote').value);
        const valor = parseFloat(document.getElementById('valorPacote').value);
        const forma = document.getElementById('pagamentoPacote').value;
        const petObj = cadastros.find(p => p.id === petId);

        await client
            .from('pacotes')
            .insert([{
                pet_id: petId,
                quantidade_total: qtd,
                quantidade_usada: 0,
                status: 'ativo'
            }]);

        await client
            .from('caixa_lancamentos')
            .insert([{
                descricao: `Venda Pacote (${qtd} Banhos) - ${petObj ? petObj.nome : ''}`,
                forma_pagamento: forma,
                valor: valor
            }]);

        closeModal('modalPacote');
        alert('Pacote cadastrado e lançado no caixa!');
        carregarDadosAtendimentos();
    } catch (e) {
        alert('Erro ao vender pacote: ' + e.message);
    }
}

function filterServices(tipo, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAtendimentos(tipo);
}

// INICIALIZAÇÃO SEGURA APÓS O CARREGAMENTO DO DOM
window.addEventListener('DOMContentLoaded', () => {
    carregarDadosAtendimentos();
});
