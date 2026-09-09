// Configuração de Conexão com o Supabase
const SUPABASE_URL = 'https://enjfjdrfkilbwilqehik.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuamZqZHJma2lsYndpbHFlaGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNDMwODQsImV4cCI6MjEwMjcxOTA4NH0.vq1rrVcLqOO6z1IuMr_uH_tx5_VIXzRPZuPmuiosr9I';

var _supabase = null;

function getSupabase() {
    if (!_supabase) {
        if (typeof supabase !== 'undefined' && supabase.createClient) {
            _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        } else if (window.supabase && window.supabase.createClient) {
            _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        } else {
            console.error('Supabase SDK não carregado');
            return null;
        }
    }
    return _supabase;
}

// FUNÇÃO DE HIGIENIZAÇÃO DE ENTRADAS (XSS)
function escapeHtml(texto) {
    if (!texto) return '';
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

let cadastros = [];
let pacotes = [];
let atendimentos = [];
let caixaLancamentos = [];
let servicosAdicionais = [];
let atendentes = [];
let tutoresLista = [];
let caixaAtualSessao = null;
let usuarioLogado = null;

function validarCaixaAberto() {
    if (!caixaAtualSessao) {
        alert('Atenção: O caixa do dia está FECHADO!\nPor favor, peça a um Administrador para abrir o caixa na aba "Caixa Diário" para realizar vendas ou check-ins.');
        return false;
    }
    return true;
}

function switchTab(tabId, btnElement = null) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    const secTarget = document.getElementById(`sec-${tabId}`);
    if (secTarget) secTarget.classList.add('active');

    if (btnElement) {
        btnElement.classList.add('active');
    } else {
        const defaultBtn = document.querySelector(`.nav-btn[onclick*="${tabId}"]`);
        if (defaultBtn) defaultBtn.classList.add('active');
    }

    if (tabId === 'atendimentos') carregarDadosAtendimentos();
    if (tabId === 'cadastros') {
        carregarTabelaPrecosAdicionais();
        carregarAtendentes();
        carregarTutoresSelect();
    }
    if (tabId === 'caixa') {
        carregarCaixa();
        carregarHistoricoCaixas();
    }
}

async function carregarDadosAtendimentos() {
    try {
        const client = getSupabase();
        if (!client) return;

        await populateSelects();
        await carregarCatalogoAdicionais();
        await carregarAtendentes();

        const { data: dataAtend, error: errAtend } = await client
            .from('atendimentos')
            .select(`
                id, pet_id, servico, tipo, tipo_entrega, status, valor, data_entrada, servicos_adicionais,
                pets ( id, nome, tutores ( nome, telefone ) ),
                atendente_checkin:atendente_checkin_id ( nome ),
                atendente_checkout:atendente_checkout_id ( nome )
            `)
            .order('data_entrada', { ascending: false });

        if (!errAtend) atendimentos = dataAtend || [];

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

async function carregarAtendentes() {
    try {
        const client = getSupabase();
        if (!client) return;

        const { data: dataUser, error } = await client
            .from('usuarios')
            .select('*')
            .order('nome');

        if (!error && dataUser) {
            atendentes = dataUser.filter(u => u.ativo !== false);
            popularSelectsAtendentes();
            renderListaAtendentes(dataUser);
        }
    } catch (e) {
        console.error('Erro ao carregar atendentes/usuários:', e);
    }
}

function popularSelectsAtendentes() {
    const ids = [
        'selectAtendenteCheckin',
        'selectAtendenteCheckout',
        'selectAtendenteVendaAdicional',
        'selectAtendenteVendaPacote'
    ];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = '<option value="">Selecione o Atendente...</option>';
            let idAtendenteEncontrado = null;

            atendentes.forEach(a => {
                const isSelected = usuarioLogado && (
                    a.nome.toLowerCase().trim() === usuarioLogado.nome.toLowerCase().trim()
                );
                if (isSelected) idAtendenteEncontrado = a.id;

                el.innerHTML += `<option value="${a.id}">${escapeHtml(a.nome)}</option>`;
            });

            if (idAtendenteEncontrado) {
                el.value = idAtendenteEncontrado;
            }
        }
    });
}

// CARREGAR TUTORES EXISTENTES NO SELECT
async function carregarTutoresSelect() {
    try {
        const client = getSupabase();
        if (!client) return;

        const { data, error } = await client
            .from('tutores')
            .select('*')
            .order('nome');

        if (!error && data) {
            tutoresLista = data;
            const sel = document.getElementById('selectTutorExistente');
            if (sel) {
                sel.innerHTML = '<option value="">Selecione um Tutor...</option>';
                data.forEach(t => {
                    sel.innerHTML += `<option value="${t.id}">${escapeHtml(t.nome)} (${escapeHtml(t.telefone || 'Sem fone')})</option>`;
                });
            }
        }
    } catch (e) {
        console.error('Erro ao carregar tutores:', e);
    }
}

// SALVAR NOVO PET PARA TUTOR EXISTENTE
async function salvarNovoPetTutorExistente() {
    const tutorId = document.getElementById('selectTutorExistente').value;
    const petNome = document.getElementById('cadNovoPetNome').value.trim();
    const petRaca = document.getElementById('cadNovoPetRaca').value.trim();
    const petObs = document.getElementById('cadNovoPetObs').value.trim();

    if (!tutorId || !petNome || !petRaca) {
        alert('Por favor, selecione o tutor e preencha o nome e raça/porte do pet.');
        return;
    }

    try {
        const client = getSupabase();
        if (!client) return;

        const { error } = await client
            .from('pets')
            .insert([{
                tutor_id: parseInt(tutorId),
                nome: petNome,
                raca_porte: petRaca,
                observacoes: petObs
            }]);

        if (error) {
            alert('Erro ao cadastrar pet: ' + error.message);
            return;
        }

        closeModal('modalNovoPetTutor');
        alert(`Novo Pet ${petNome} vinculado ao tutor com sucesso!`);
        await populateSelects();
    } catch (e) {
        alert('Erro: ' + e.message);
    }
}

// ABRIR HISTÓRICO A PARTIR DO SELECT DA MODAL DE CHECK-IN
function abrirHistoricoPetSelecionadoCheckin() {
    const selPet = document.getElementById('selectPetCheckin');
    if (!selPet || !selPet.value) {
        alert('Por favor, selecione um pet primeiro para visualizar o histórico.');
        return;
    }

    const petId = parseInt(selPet.value);
    const petObj = cadastros.find(p => p.id === petId);
    const petNome = petObj ? petObj.nome : 'Pet';

    abrirHistoricoPet(petId, petNome);
}

// CONSULTAR E EXIBIR HISTÓRICO COMPLETO E OBSERVAÇÕES DO PET (DO PRIMEIRO AO ÚLTIMO ATENDIMENTO)
async function abrirHistoricoPet(petId, petNome) {
    const container = document.getElementById('historicoPetConteudo');
    const titulo = document.getElementById('historicoPetTitulo');
    if (!container) return;

    titulo.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Histórico do Pet: <strong>${escapeHtml(petNome)}</strong>`;
    container.innerHTML = '<p style="text-align:center; color:#888; padding:15px;">Carregando histórico e observações...</p>';
    openModal('modalHistoricoPet');

    try {
        const client = getSupabase();
        if (!client) return;

        // 1. Busca os dados e observações fixas do Pet e Tutor
        const { data: petData, error: errPet } = await client
            .from('pets')
            .select(`
                id, nome, raca_porte, observacoes,
                tutores ( nome, telefone )
            `)
            .eq('id', petId)
            .single();

        let obsHtml = '';
        if (petData) {
            const tutorNome = petData.tutores ? petData.tutores.nome : 'Não informado';
            const tutorFone = petData.tutores ? petData.tutores.telefone : 'Não informado';
            const obsTexto = petData.observacoes ? escapeHtml(petData.observacoes) : 'Nenhuma observação cadastrada.';

            obsHtml = `
                <div style="background: #fff3e0; border: 1px solid #ffe0b2; border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <strong><i class="fa-solid fa-address-card" style="color:#e65100;"></i> Tutor: ${escapeHtml(tutorNome)}</strong>
                        <span style="color:#e65100; font-weight:600;"><i class="fa-solid fa-phone"></i> ${escapeHtml(tutorFone)}</span>
                    </div>
                    <div><strong>Raça / Porte:</strong> ${escapeHtml(petData.raca_porte || '-')}</div>
                    <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed #ffd180; color: #d84315;">
                        <i class="fa-solid fa-triangle-exclamation"></i> <strong>Observações / Cuidados Especiais:</strong><br>
                        ${obsTexto}
                    </div>
                </div>
            `;
        }

        // 2. Busca todos os atendimentos desde o PRIMEIRO (ordem cronológica decrescente)
        const { data: atendimentosData, error: errAtend } = await client
            .from('atendimentos')
            .select(`
                id, servico, tipo, status, valor, data_entrada, servicos_adicionais,
                atendente_checkin:atendente_checkin_id ( nome ),
                atendente_checkout:atendente_checkout_id ( nome )
            `)
            .eq('pet_id', petId)
            .order('data_entrada', { ascending: false });

        if (errAtend) {
            container.innerHTML = obsHtml + `<p style="color:#d32f2f;">Erro ao buscar histórico: ${errAtend.message}</p>`;
            return;
        }

        let historicoListHtml = '';

        if (!atendimentosData || atendimentosData.length === 0) {
            historicoListHtml = `<p style="text-align:center; color:#888; padding:15px; background:#f9f9f9; border-radius:6px;">Este pet ainda não possui histórico de atendimentos anteriores no sistema.</p>`;
        } else {
            atendimentosData.forEach((item, index) => {
                const dt = item.data_entrada ? new Date(item.data_entrada).toLocaleString('pt-BR') : '-';
                const atendIn = item.atendente_checkin ? item.atendente_checkin.nome : 'Sistema';
                const atendOut = item.atendente_checkout ? item.atendente_checkout.nome : '-';
                const numAtendimento = atendimentosData.length - index;

                let adicionaisTexto = '';
                if (item.servicos_adicionais && Array.isArray(item.servicos_adicionais) && item.servicos_adicionais.length > 0) {
                    adicionaisTexto = `<br><span style="color:#6a1b9a;">+ Adicionais: ${item.servicos_adicionais.map(s => escapeHtml(s.nome)).join(', ')}</span>`;
                }

                historicoListHtml += `
                    <div style="background:#fafafa; border:1px solid #eee; border-radius:6px; padding:10px; margin-bottom:8px; font-size:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <strong>#${numAtendimento} - ${escapeHtml(item.servico)} (${item.tipo})</strong>
                            <span class="badge" style="background:${item.status === 'finalizado' ? '#e8f5e9' : '#fff3e0'}; color:${item.status === 'finalizado' ? '#2e7d32' : '#e65100'}; font-size:10px;">
                                ${escapeHtml(item.status)}
                            </span>
                        </div>
                        <p style="color:#555; margin:2px 0;">
                            Data: <strong>${dt}</strong> | Valor Total: <strong>R$ ${parseFloat(item.valor || 0).toFixed(2)}</strong> ${adicionaisTexto}
                        </p>
                        <small style="color:#777;">Atendente Check-in: <strong>${escapeHtml(atendIn)}</strong> | Check-out: <strong>${escapeHtml(atendOut)}</strong></small>
                    </div>
                `;
            });
        }

        container.innerHTML = obsHtml + `<h4 style="font-size:13px; color:var(--purple-main); margin:10px 0 8px 0;"><i class="fa-solid fa-list-ol"></i> Registros de Atendimentos (${atendimentosData ? atendimentosData.length : 0})</h4>` + historicoListHtml;

    } catch (e) {
        container.innerHTML = `<p style="color:#d32f2f;">Erro ao carregar histórico: ${e.message}</p>`;
    }
}

function renderAtendimentos(filter = 'todos') {
    const list = document.getElementById('serviceList');
    if (!list) return;
    list.innerHTML = '';

    let filtered = atendimentos.filter(a => {
        const st = (a.status || 'em_andamento').toLowerCase().trim();
        if (st === 'finalizado') return false;

        if (filter === 'todos') return true;
        if (filter === 'em_andamento') return st === 'em_andamento' || st === 'em atendimento';
        if (filter === 'pronto') return st === 'pronto';
        return true;
    });

    if (filtered.length === 0) {
        list.innerHTML = `<p style="text-align:center; color:#888; padding:15px;">Nenhum atendimento presente no momento.</p>`;
        return;
    }

    filtered.forEach(item => {
        const isPkg = item.tipo === 'pacote';

        let petNome = 'Pet Sem Nome';
        let tutorNome = 'Tutor Não Informado';
        let tutorFone = '';
        let petId = item.pet_id;

        if (item.pets) {
            petNome = item.pets.nome || petNome;
            if (item.pets.tutores) {
                tutorNome = item.pets.tutores.nome || tutorNome;
                tutorFone = item.pets.tutores.telefone || '';
            }
        }

        const hora = item.data_entrada ? new Date(item.data_entrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
        const isPronto = (item.status || '').toLowerCase().trim() === 'pronto';
        const tipoEntrega = item.tipo_entrega || 'retirada';
        const textoEntrega = tipoEntrega === 'entrega' ? 'Delivery / Táxi Pet' : 'Retirada na Loja';

        let adicionaisTexto = '';
        if (item.servicos_adicionais && Array.isArray(item.servicos_adicionais) && item.servicos_adicionais.length > 0) {
            adicionaisTexto = `<br><span style="color: #6a1b9a; font-size:11px;">+ Adicionais: ${item.servicos_adicionais.map(s => `${escapeHtml(s.nome)} (R$ ${parseFloat(s.preco || 0).toFixed(2)})`).join(', ')}</span>`;
        }

        let tagCheckin = item.atendente_checkin ? `<span class="badge" style="background:#f3e5f5; color:#6a1b9a; font-size:10px; margin-left:4px;"><i class="fa-solid fa-user-plus"></i> In: ${escapeHtml(item.atendente_checkin.nome)}</span>` : '';
        let tagCheckout = item.atendente_checkout ? `<span class="badge" style="background:#e8f5e9; color:#2e7d32; font-size:10px; margin-left:4px;"><i class="fa-solid fa-user-check"></i> Out: ${escapeHtml(item.atendente_checkout.nome)}</span>` : '';

        list.innerHTML += `
            <div class="service-item" style="flex-direction:column; align-items:stretch; gap:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="pet-info">
                        <div class="pet-icon" style="background:${isPronto ? '#e8f5e9' : '#f0eaf4'}; color:${isPronto ? '#2e7d32' : 'var(--purple-main)'};">
                            <i class="fa-solid ${isPronto ? 'fa-circle-check' : 'fa-dog'}"></i>
                        </div>
                        <div>
                            <strong>${escapeHtml(petNome)}</strong> <small>(${escapeHtml(tutorNome)})</small> ${tagCheckin} ${tagCheckout}
                            <button class="btn btn-sm btn-gray" style="padding:1px 6px; font-size:9px; margin-left:6px;" onclick="abrirHistoricoPet(${petId}, '${escapeHtml(petNome)}')">
                                <i class="fa-solid fa-clock-rotate-left"></i> Histórico
                            </button>
                            <p style="font-size:11px; color:#666;">${escapeHtml(item.servico)} • ${textoEntrega} • Entrou às ${hora} ${adicionaisTexto}</p>
                        </div>
                    </div>
                    <div>
                        <span class="badge ${isPronto ? 'badge-avulso' : 'badge-pacote'}" style="margin-right:5px;">
                            ${isPronto ? 'Pronto para Busca' : 'Em Atendimento'}
                        </span>
                        <span class="badge ${isPkg ? 'badge-pacote' : 'badge-avulso'}">
                            ${isPkg ? 'Pacote' : 'R$ ' + parseFloat(item.valor || 0).toFixed(2)}
                        </span>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid #f0eaf4; padding-top:8px;">
                    ${!isPronto ? `
                        <button class="btn btn-sm btn-yellow" onclick="alterarStatusAtendimento(${item.id}, 'pronto')">
                            <i class="fa-solid fa-check"></i> Marcar como Pronto
                        </button>
                    ` : `
                        <button class="btn btn-sm" style="background:#25D366; color:#fff;" onclick="notificarWhatsapp('${escapeHtml(tutorNome)}', '${escapeHtml(tutorFone)}', '${escapeHtml(petNome)}', '${tipoEntrega}')">
                            <i class="fa-brands fa-whatsapp"></i> Avisar no WhatsApp
                        </button>
                        <button class="btn btn-sm btn-purple" onclick="abrirModalCheckout(${item.id})">
                            <i class="fa-solid fa-arrow-right-from-bracket"></i> Dar Check-out
                        </button>
                    `}
                </div>
            </div>
        `;
    });
}

async function salvarUsuarioAtendente(e) {
    if (e) e.preventDefault();
    if (!validarPermissaoAdmin()) return;

    const nome = document.getElementById('cadUsuarioNome').value.trim();
    const email = document.getElementById('cadUsuarioEmail').value.trim();
    const senha = document.getElementById('cadUsuarioSenha').value.trim();
    const perfil = document.getElementById('cadUsuarioPerfil').value;

    if (!nome || !email || !senha) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }

    try {
        const client = getSupabase();
        if (!client) return;

        const { error: errUser } = await client
            .from('usuarios')
            .insert([{ nome, email, senha, perfil, ativo: true }]);

        if (errUser) {
            alert('Erro ao cadastrar Usuário: ' + errUser.message);
            return;
        }

        await client.from('atendentes').insert([{ nome, ativo: true }]);

        document.getElementById('formCadastroAtendente').reset();
        alert(`Usuário/Atendente ${nome} cadastrado com sucesso!`);
        await carregarAtendentes();

    } catch (e) {
        alert('Erro ao cadastrar: ' + e.message);
    }
}

function renderListaAtendentes(todosUsuarios) {
    const container = document.getElementById('listaAtendentesContainer');
    if (!container || !todosUsuarios) return;

    container.innerHTML = '';
    const isAdmin = usuarioLogado && usuarioLogado.perfil === 'admin';

    todosUsuarios.forEach(u => {
        const isAdm = u.perfil === 'admin';
        const isAtivo = u.ativo !== false;

        container.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px dashed #eee; font-size: 12px; ${!isAtivo ? 'opacity: 0.55; background: #f9f9f9;' : ''}">
                <div>
                    <strong><i class="fa-solid ${isAdm ? 'fa-user-shield' : 'fa-user-check'}" style="color:var(--purple-main);"></i> ${escapeHtml(u.nome)}</strong> 
                    <small style="color:#777;">(${escapeHtml(u.email)})</small><br>
                    <span class="badge ${isAdm ? 'badge-pacote' : 'badge-avulso'}" style="background:${isAdm ? '#f3e5f5' : '#e8f5e9'}; color:${isAdm ? '#6a1b9a' : '#2e7d32'}; font-size:9px;">
                        ${isAdm ? 'Administrador' : 'Atendente'}
                    </span>
                    <span class="badge" style="background:${isAtivo ? '#e8f5e9' : '#ffebee'}; color:${isAtivo ? '#2e7d32' : '#c62828'}; font-size:9px;">
                        ${isAtivo ? 'Ativo' : 'Inativo'}
                    </span>
                </div>
                ${isAdmin ? `
                    <div style="display:flex; gap: 4px;">
                        <button class="btn btn-sm btn-yellow" onclick="abrirModalEditarUsuario(${u.id})" title="Editar Usuário" style="padding: 3px 7px; font-size: 10px;">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-sm ${isAtivo ? 'btn-red' : 'btn-green'}" onclick="alternarStatusUsuario(${u.id}, ${isAtivo})" title="${isAtivo ? 'Inativar Usuário' : 'Ativar Usuário'}" style="padding: 3px 7px; font-size: 10px;">
                            <i class="fa-solid ${isAtivo ? 'fa-user-xmark' : 'fa-user-check'}"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    });
}

async function abrirModalEditarUsuario(idUsuario) {
    try {
        const client = getSupabase();
        if (!client) return;

        const { data, error } = await client
            .from('usuarios')
            .select('*')
            .eq('id', idUsuario)
            .single();

        if (error || !data) {
            alert('Erro ao carregar dados do usuário.');
            return;
        }

        document.getElementById('editUsuarioId').value = data.id;
        document.getElementById('editUsuarioNome').value = data.nome;
        document.getElementById('editUsuarioEmail').value = data.email;
        document.getElementById('editUsuarioSenha').value = '';
        document.getElementById('editUsuarioPerfil').value = data.perfil;

        openModal('modalEditarUsuario');
    } catch (e) {
        alert('Erro: ' + e.message);
    }
}

async function salvarEdicaoUsuario() {
    if (!validarPermissaoAdmin()) return;

    const id = document.getElementById('editUsuarioId').value;
    const nome = document.getElementById('editUsuarioNome').value.trim();
    const email = document.getElementById('editUsuarioEmail').value.trim();
    const senha = document.getElementById('editUsuarioSenha').value.trim();
    const perfil = document.getElementById('editUsuarioPerfil').value;

    if (!nome || !email) {
        alert('Nome e E-mail são obrigatórios.');
        return;
    }

    try {
        const client = getSupabase();
        if (!client) return;

        let dadosAtualizacao = { nome, email, perfil };
        if (senha) {
            dadosAtualizacao.senha = senha;
        }

        const { error: errUser } = await client
            .from('usuarios')
            .update(dadosAtualizacao)
            .eq('id', id);

        if (errUser) {
            alert('Erro ao atualizar usuário: ' + errUser.message);
            return;
        }

        await client.from('atendentes').update({ nome }).eq('nome', nome);

        closeModal('modalEditarUsuario');
        alert('Usuário atualizado com sucesso!');
        await carregarAtendentes();

    } catch (e) {
        alert('Erro ao salvar alterações: ' + e.message);
    }
}

async function alternarStatusUsuario(idUsuario, statusAtualAtivo) {
    if (!validarPermissaoAdmin()) return;

    const acao = statusAtualAtivo ? 'INATIVAR' : 'ATIVAR';
    if (!confirm(`Tem certeza que deseja ${acao} este usuário?\n${statusAtualAtivo ? 'O usuário não conseguirá mais realizar login no sistema.' : 'O usuário voltará a ter acesso ao sistema.'}`)) {
        return;
    }

    try {
        const client = getSupabase();
        if (!client) return;

        const { error } = await client
            .from('usuarios')
            .update({ ativo: !statusAtualAtivo })
            .eq('id', idUsuario);

        if (error) {
            alert(`Erro ao ${acao.toLowerCase()} usuário: ` + error.message);
            return;
        }

        alert(`Usuário ${statusAtualAtivo ? 'inativado' : 'ativado'} com sucesso!`);
        await carregarAtendentes();

    } catch (e) {
        alert('Erro ao alterar status: ' + e.message);
    }
}

async function carregarCatalogoAdicionais() {
    try {
        const client = getSupabase();
        if (!client) return;

        const { data, error } = await client
            .from('servicos_adicionais')
            .select('*')
            .eq('ativo', true)
            .order('nome');

        if (!error && data) {
            servicosAdicionais = data;
        }
    } catch (e) {
        console.error('Erro ao carregar serviços adicionais:', e);
    }
}

async function alterarStatusAtendimento(id, novoStatus) {
    try {
        const client = getSupabase();
        if (!client) return;

        const { error } = await client
            .from('atendimentos')
            .update({ status: novoStatus })
            .eq('id', id);

        if (error) {
            alert('Erro ao atualizar status: ' + error.message);
            return;
        }

        await carregarDadosAtendimentos();
    } catch (e) {
        alert('Erro ao alterar status: ' + e.message);
    }
}

function abrirModalCheckout(atendimentoId) {
    document.getElementById('checkoutAtendimentoId').value = atendimentoId;
    openModal('modalCheckout');
}

async function confirmarCheckoutAtendimento() {
    const id = document.getElementById('checkoutAtendimentoId').value;
    const atendenteId = document.getElementById('selectAtendenteCheckout').value;

    if (!atendenteId) {
        alert('Selecione o atendente responsável pelo check-out.');
        return;
    }

    try {
        const client = getSupabase();
        if (!client) return;

        const { error } = await client
            .from('atendimentos')
            .update({
                status: 'finalizado',
                atendente_checkout_id: parseInt(atendenteId)
            })
            .eq('id', id);

        if (error) {
            alert('Erro ao atualizar status: ' + error.message);
            return;
        }

        closeModal('modalCheckout');
        alert('Check-out realizado com sucesso! Pet entregue ao tutor.');
        await carregarDadosAtendimentos();
    } catch (e) {
        alert('Erro: ' + e.message);
    }
}

function notificarWhatsapp(tutorNome, fone, petNome, tipoEntrega = 'retirada') {
    if (!fone) {
        alert('Telefone do tutor não cadastrado.');
        return;
    }
    const numLimpo = fone.replace(/\D/g, '');
    let textoMensagem = '';

    if (tipoEntrega === 'entrega') {
        textoMensagem = `Olá ${tutorNome}! O pet ${petNome} já finalizou o serviço na Petz Lândia e nosso táxi pet já está se preparando para levá-lo de volta até você! 🚗🐾`;
    } else {
        textoMensagem = `Olá ${tutorNome}! O pet ${petNome} já finalizou o serviço na Petz Lândia e está prontinho esperando por você para ser buscado! 🐾`;
    }

    const msg = encodeURIComponent(textoMensagem);
    window.open(`https://wa.me/55${numLimpo}?text=${msg}`, '_blank');
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
                    <strong>${escapeHtml(petNome)} <small>(${escapeHtml(tutorNome)})</small></strong>
                    <span style="color:var(--purple-main); font-weight:600;">${restante} restantes</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                <small style="font-size:10px; color:#777;">${pkg.quantidade_usada} de ${pkg.quantidade_total} banhos utilizados</small>
            </div>
        `;
    });
}

async function carregarCaixa() {
    try {
        const client = getSupabase();
        if (!client) return;

        let query = client
            .from('caixa_lancamentos')
            .select(`
                *,
                atendentes:atendente_id ( nome )
            `)
            .order('data_lancamento', { ascending: false });

        const dtInicio = document.getElementById('filtroDataInicio')?.value;
        const dtFim = document.getElementById('filtroDataFim')?.value;
        const formaPagto = document.getElementById('filtroFormaPagto')?.value;

        if (dtInicio) {
            query = query.gte('data_lancamento', `${dtInicio}T00:00:00`);
        }
        if (dtFim) {
            query = query.lte('data_lancamento', `${dtFim}T23:59:59`);
        }
        if (formaPagto && formaPagto !== 'todos') {
            query = query.ilike('forma_pagamento', `%${formaPagto}%`);
        }

        const { data, error } = await query;

        if (!error) caixaLancamentos = data || [];
        renderCaixa();
    } catch (e) {
        console.error('Erro ao carregar caixa (RF17):', e);
    }
}

function limparFiltrosCaixa() {
    const elInicio = document.getElementById('filtroDataInicio');
    const elFim = document.getElementById('filtroDataFim');
    const elForma = document.getElementById('filtroFormaPagto');

    if (elInicio) elInicio.value = '';
    if (elFim) elFim.value = '';
    if (elForma) elForma.value = 'todos';

    carregarCaixa();
}

function renderCaixa() {
    const list = document.getElementById('caixaLancamentos');
    if (!list) return;
    list.innerHTML = '';

    let total = 0, pix = 0, outros = 0;
    const isAdmin = usuarioLogado && usuarioLogado.perfil === 'admin';

    if (caixaLancamentos.length === 0) {
        list.innerHTML = `<p style="text-align:center; color:#888; padding:15px;">Nenhum lançamento encontrado para os filtros selecionados.</p>`;
    }

    caixaLancamentos.forEach(c => {
        const v = parseFloat(c.valor || 0);
        const isCancelado = c.status === 'cancelado';
        const isSangria = v < 0;

        if (!isCancelado) {
            total += v;
            if ((c.forma_pagamento || '').toUpperCase().includes('PIX')) pix += v;
            else outros += v;
        }

        let corValor = isSangria ? '#d32f2f' : 'var(--green-badge)';
        if (isCancelado) corValor = '#9e9e9e';

        let nomeAtend = c.atendentes ? c.atendentes.nome : (usuarioLogado ? usuarioLogado.nome : 'Sistema');

        list.innerHTML += `
            <div class="service-item" style="${isCancelado ? 'opacity: 0.55; background: #f5f5f5;' : ''}">
                <div>
                    <strong>${escapeHtml(c.descricao)} ${isCancelado ? '<small style="color: #d32f2f; font-weight:bold;">(CANCELADO)</small>' : ''}</strong>
                    <p style="font-size:11px; color:#666;">
                        Forma de Pagamento: <strong>${escapeHtml(c.forma_pagamento)}</strong> 
                        <span style="color: #6a1b9a; font-weight: 500;">• Operador: ${escapeHtml(nomeAtend)}</span>
                        ${c.data_lancamento ? ` • ${new Date(c.data_lancamento).toLocaleString('pt-BR')}` : ''}
                    </p>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <strong style="color:${corValor}; ${isCancelado ? 'text-decoration: line-through;' : ''}">
                        ${isSangria ? '- R$ ' + Math.abs(v).toFixed(2) : '+ R$ ' + v.toFixed(2)}
                    </strong>
                    ${(!isCancelado && isAdmin) ? `
                        <button class="btn btn-sm btn-red" onclick="estornarLancamentoCaixa(${c.id})" title="Cancelar / Estornar Lançamento" style="padding: 3px 8px; font-size: 10px;">
                            <i class="fa-solid fa-ban"></i> Estornar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    document.getElementById('caixaTotal').innerText = `R$ ${total.toFixed(2)}`;
    document.getElementById('caixaPix').innerText = `R$ ${pix.toFixed(2)}`;
    document.getElementById('caixaOutros').innerText = `R$ ${outros.toFixed(2)}`;
}

async function estornarLancamentoCaixa(idLancamento) {
    if (!validarPermissaoAdmin()) return;

    if (!confirm('Tem certeza que deseja CANCELAR este lançamento do caixa?\nEsta ação será registrada no histórico de auditoria.')) {
        return;
    }

    try {
        const client = getSupabase();
        if (!client) return;

        const { error } = await client
            .from('caixa_lancamentos')
            .update({
                status: 'cancelado',
                cancelado_por: usuarioLogado.nome,
                cancelado_em: new Date().toISOString()
            })
            .eq('id', idLancamento);

        if (error) {
            alert('Erro ao estornar lançamento: ' + error.message);
            return;
        }

        alert('Lançamento cancelado e estornado com sucesso!');
        await carregarCaixa();

    } catch (e) {
        alert('Erro ao processar estorno: ' + e.message);
    }
}

function exportarCaixaCSV() {
    if (!caixaLancamentos || caixaLancamentos.length === 0) {
        alert('Não há lançamentos no caixa para exportar.');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "ID;Data/Hora;Descricao;Forma Pagamento;Atendente;Valor (R$);Status\n";

    caixaLancamentos.forEach(c => {
        const dataFormatada = c.data_lancamento
            ? new Date(c.data_lancamento).toLocaleString('pt-BR')
            : '';
        const nomeAtend = c.atendentes ? c.atendentes.nome : 'Sistema';
        const valorFormatado = parseFloat(c.valor || 0).toFixed(2).replace('.', ',');

        const linha = `${c.id};"${dataFormatada}";"${c.descricao}";${c.forma_pagamento};"${nomeAtend}";${valorFormatado};${c.status || 'ativo'}`;
        csvContent += linha + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);

    const dataHoje = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `relatorio_vendas_petzlandia_${dataHoje}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function imprimirRelatorioCaixa() {
    if (!caixaLancamentos || caixaLancamentos.length === 0) {
        alert('Não há dados de caixa para gerar relatório.');
        return;
    }

    let totalGeral = 0, pix = 0, dinheiro = 0, cartao = 0, sangrias = 0;

    caixaLancamentos.forEach(c => {
        if (c.status !== 'cancelado') {
            const v = parseFloat(c.valor || 0);
            if (v < 0) {
                sangrias += Math.abs(v);
            } else {
                totalGeral += v;
                const forma = (c.forma_pagamento || '').toLowerCase();
                if (forma.includes('pix')) pix += v;
                else if (forma.includes('dinheiro')) dinheiro += v;
                else cartao += v;
            }
        }
    });

    const janelaImpressao = window.open('', '', 'width=850,height=650');
    janelaImpressao.document.write(`
        <html>
        <head>
            <title>Relatório de Fechamento e Vendas - Petz Lândia</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #333; }
                .header { text-align: center; border-bottom: 2px solid #6a1b9a; padding-bottom: 10px; margin-bottom: 15px; }
                .header h2 { color: #6a1b9a; margin: 0; }
                .header p { margin: 3px 0; font-size: 12px; color: #666; }
                .resumo-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 15px 0; }
                .card { background: #f8f5fa; border: 1px solid #e1d5e7; padding: 10px; border-radius: 6px; text-align: center; }
                .card span { font-size: 11px; color: #666; display: block; }
                .card strong { font-size: 15px; color: #6a1b9a; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
                th, td { border: 1px solid #ddd; padding: 7px 10px; text-align: left; }
                th { background-color: #6a1b9a; color: #fff; }
                tr:nth-child(even) { background-color: #fcfcfc; }
                .cancelado { text-decoration: line-through; color: #999; }
                .sangria { color: #d32f2f; font-weight: bold; }
                .footer { margin-top: 25px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>Petz Lândia - Relatório de Fechamento & Vendas (RF17)</h2>
                <p>Emissão: ${new Date().toLocaleString('pt-BR')} | Operador: ${usuarioLogado ? escapeHtml(usuarioLogado.nome) : 'Sistema'}</p>
            </div>

            <div class="resumo-grid">
                <div class="card">
                    <span>Total de Vendas</span>
                    <strong>R$ ${totalGeral.toFixed(2)}</strong>
                </div>
                <div class="card">
                    <span>Total em PIX</span>
                    <strong>R$ ${pix.toFixed(2)}</strong>
                </div>
                <div class="card">
                    <span>Cartão / Dinheiro</span>
                    <strong>R$ ${(dinheiro + cartao).toFixed(2)}</strong>
                </div>
                <div class="card">
                    <span>Total Sangrias</span>
                    <strong style="color:#d32f2f;">R$ ${sangrias.toFixed(2)}</strong>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Data/Hora</th>
                        <th>Descrição Lançamento</th>
                        <th>Atendente</th>
                        <th>Pagamento</th>
                        <th>Valor (R$)</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${caixaLancamentos.map(c => `
                        <tr class="${c.status === 'cancelado' ? 'cancelado' : ''}">
                            <td>${c.data_lancamento ? new Date(c.data_lancamento).toLocaleString('pt-BR') : '-'}</td>
                            <td>${escapeHtml(c.descricao)}</td>
                            <td>${c.atendentes ? escapeHtml(c.atendentes.nome) : 'Sistema'}</td>
                            <td>${escapeHtml(c.forma_pagamento)}</td>
                            <td class="${parseFloat(c.valor) < 0 ? 'sangria' : ''}">
                                R$ ${parseFloat(c.valor || 0).toFixed(2)}
                            </td>
                            <td>${c.status || 'ativo'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="footer">
                Documento gerado automaticamente pelo Sistema Petz Lândia - Controle de Vendas e Fechamento de Caixa.
            </div>

            <script>
                window.onload = function() { window.print(); window.close(); }
            </script>
        </body>
        </html>
    `);
    janelaImpressao.document.close();
}

async function populateSelects() {
    const selCheckin = document.getElementById('selectPetCheckin');
    const selPacote = document.getElementById('selectPetPacote');
    const selAdicional = document.getElementById('selectPetAdicional');

    if (!selCheckin || !selPacote) return;
    selCheckin.innerHTML = '<option value="">Selecione o Pet...</option>';
    selPacote.innerHTML = '<option value="">Selecione o Pet...</option>';
    if (selAdicional) selAdicional.innerHTML = '<option value="">Selecione o Pet...</option>';

    try {
        const client = getSupabase();
        if (!client) return;

        // Busca pets trazendo os dados do tutor relacionado
        const { data, error } = await client
            .from('pets')
            .select(`
                id, 
                nome, 
                raca_porte,
                tutores ( id, nome, telefone )
            `)
            .order('nome');

        if (!error && data) {
            cadastros = data;
            data.forEach(p => {
                const tutorNome = p.tutores ? p.tutores.nome : 'Sem Tutor';
                const raca = p.raca_porte ? ` - ${p.raca_porte}` : '';
                const opt = `<option value="${p.id}">${escapeHtml(p.nome)}${escapeHtml(raca)} (Tutor: ${escapeHtml(tutorNome)})</option>`;

                selCheckin.innerHTML += opt;
                selPacote.innerHTML += opt;
                if (selAdicional) selAdicional.innerHTML += opt;
            });
        }
    } catch (e) {
        console.error('Erro ao popular selects de pets:', e);
    }
}

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

function openModal(id) {
    if ((id === 'modalAtendimento' || id === 'modalPacote' || id === 'modalServicoAdicional') && !caixaAtualSessao) {
        alert('O caixa do dia precisa estar ABERTO para realizar vendas ou check-ins.\nContate um Administrador.');
        return;
    }

    populateSelects();
    popularSelectsAtendentes();

    if (id === 'modalAtendimento') {
        toggleValorAvulso();
        renderCheckinAdicionais();
    }
    if (id === 'modalServicoAdicional') {
        renderVendaAdicionaisLista();
    }
    if (id === 'modalNovoPetTutor') {
        carregarTutoresSelect();
    }
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

async function carregarTabelaPrecosAdicionais() {
    const container = document.getElementById('tabelaPrecosAdicionaisContainer');
    if (!container) return;

    await carregarCatalogoAdicionais();
    container.innerHTML = '';

    servicosAdicionais.forEach(item => {
        const isAPartir = item.a_partir === true;
        container.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px dashed #eee; padding-bottom: 5px;">
                <span style="font-size: 13px; font-weight: 500;">${escapeHtml(item.nome)}</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="font-size: 11px; color: #666; cursor: pointer; display: flex; align-items: center; gap: 3px;">
                        <input type="checkbox" class="chk-a-partir-adicional" data-id="${item.id}" ${isAPartir ? 'checked' : ''}> A partir de
                    </label>
                    <span style="font-size: 12px; color: #555;">R$</span>
                    <input type="number" step="0.50" min="0" class="form-control input-preco-adicional" data-id="${item.id}" value="${parseFloat(item.preco || 0).toFixed(2)}" style="width: 80px; padding: 4px 8px; font-size: 12px;">
                </div>
            </div>
        `;
    });
}

async function salvarPrecosAdicionais() {
    if (!validarPermissaoAdmin()) return;

    try {
        const client = getSupabase();
        if (!client) return;

        const inputsPreco = document.querySelectorAll('.input-preco-adicional');
        for (let input of inputsPreco) {
            const id = parseInt(input.getAttribute('data-id'));
            const novoPreco = parseFloat(input.value) || 0;
            const chkAPartir = document.querySelector(`.chk-a-partir-adicional[data-id="${id}"]`);
            const aPartirVal = chkAPartir ? chkAPartir.checked : false;

            await client
                .from('servicos_adicionais')
                .update({ preco: novoPreco, a_partir: aPartirVal })
                .eq('id', id);
        }

        alert('Tabela de preços atualizada com sucesso!');
        await carregarCatalogoAdicionais();
    } catch (e) {
        alert('Erro ao salvar preços: ' + e.message);
    }
}

function renderVendaAdicionaisLista() {
    const container = document.getElementById('vendaAdicionaisListaContainer');
    if (!container) return;
    container.innerHTML = '';

    servicosAdicionais.forEach(item => {
        const v = parseFloat(item.preco || 0).toFixed(2);
        const isAPartir = item.a_partir === true;

        container.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 6px 0; border-bottom: 1px solid #f5f5f5;">
                <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" class="chk-venda-adicional" value="${item.id}" data-min-preco="${v}" data-nome="${escapeHtml(item.nome)}" onchange="toggleInputAdicionalVenda(${item.id})"> 
                    ${escapeHtml(item.nome)} ${isAPartir ? '<small style="color:#e65100; font-weight:600;">(A partir)</small>' : ''}
                </label>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span style="font-size: 11px; color: #666;">R$</span>
                    <input type="number" step="0.50" min="${v}" value="${v}" id="inputValVendaAdicional_${item.id}" class="form-control" 
                           style="width: 75px; padding: 2px 5px; font-size: 12px; text-align: right;" 
                           ${!isAPartir ? 'disabled' : 'readonly'} onchange="calcularTotalVendaAdicional()">
                </div>
            </div>
        `;
    });
    calcularTotalVendaAdicional();
}

function toggleInputAdicionalVenda(id) {
    const chk = document.querySelector(`.chk-venda-adicional[value="${id}"]`);
    const inputVal = document.getElementById(`inputValVendaAdicional_${id}`);
    if (chk && inputVal) {
        const itemObj = servicosAdicionais.find(s => s.id === id);
        if (itemObj && itemObj.a_partir) {
            inputVal.readOnly = !chk.checked;
        }
    }
    calcularTotalVendaAdicional();
}

function calcularTotalVendaAdicional() {
    const checkboxes = document.querySelectorAll('.chk-venda-adicional:checked');
    let total = 0;
    checkboxes.forEach(chk => {
        const id = chk.value;
        const inputVal = document.getElementById(`inputValVendaAdicional_${id}`);
        const v = inputVal ? parseFloat(inputVal.value) || 0 : parseFloat(chk.getAttribute('data-min-preco')) || 0;
        total += v;
    });
    document.getElementById('totalVendaAdicionalText').innerText = `R$ ${total.toFixed(2)}`;
}

async function salvarVendaAdicionalAvulso() {
    if (!validarCaixaAberto()) return;

    try {
        const client = getSupabase();
        if (!client) return;

        const petId = parseInt(document.getElementById('selectPetAdicional').value);
        const atendenteId = document.getElementById('selectAtendenteVendaAdicional').value;
        const checkboxes = document.querySelectorAll('.chk-venda-adicional:checked');
        const forma = document.getElementById('pagamentoAdicionalAvulso').value;

        if (!atendenteId) {
            alert('Selecione o atendente responsável pela venda.');
            return;
        }

        if (checkboxes.length === 0) {
            alert('Selecione ao menos um serviço adicional.');
            return;
        }

        let total = 0;
        let nomes = [];
        let erroPrecoMinimo = false;

        checkboxes.forEach(chk => {
            const id = chk.value;
            const minPreco = parseFloat(chk.getAttribute('data-min-preco')) || 0;
            const inputVal = document.getElementById(`inputValVendaAdicional_${id}`);
            const valorFinal = inputVal ? parseFloat(inputVal.value) || 0 : minPreco;

            if (valorFinal < minPreco) {
                alert(`O valor do serviço ${chk.getAttribute('data-nome')} não pode ser menor que R$ ${minPreco.toFixed(2)}.`);
                erroPrecoMinimo = true;
                return;
            }

            total += valorFinal;
            nomes.push(`${chk.getAttribute('data-nome')} (R$ ${valorFinal.toFixed(2)})`);
        });

        if (erroPrecoMinimo) return;

        const petObj = cadastros.find(p => p.id === petId);
        const desc = `Serviços Adicionais (${nomes.join(', ')}) - ${petObj ? petObj.nome : ''}`;

        const { error: errLanc } = await client
            .from('caixa_lancamentos')
            .insert([{
                descricao: desc,
                forma_pagamento: forma,
                valor: total,
                atendente_id: parseInt(atendenteId)
            }]);

        if (errLanc) {
            alert('Erro ao lançar no caixa: ' + errLanc.message);
            return;
        }

        closeModal('modalServicoAdicional');
        alert('Serviços adicionais faturados e lançados no caixa!');
        await carregarDadosAtendimentos();
    } catch (e) {
        alert('Erro: ' + e.message);
    }
}

function renderCheckinAdicionais() {
    const container = document.getElementById('checkinAdicionaisContainer');
    if (!container) return;
    container.innerHTML = '';

    servicosAdicionais.forEach(item => {
        const v = parseFloat(item.preco || 0).toFixed(2);
        const isAPartir = item.a_partir === true;

        container.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding: 4px 0; border-bottom: 1px dashed #eee;">
                <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" class="chk-checkin-adicional" value="${item.id}" data-min-preco="${v}" data-nome="${escapeHtml(item.nome)}" onchange="toggleInputAdicionalCheckin(${item.id})"> 
                    ${escapeHtml(item.nome)} ${isAPartir ? '<small style="color:#e65100; font-weight:600;">(A partir)</small>' : ''}
                </label>
                <div style="display: flex; align-items: center; gap: 3px;">
                    <span style="color: #666;">+ R$</span>
                    <input type="number" step="0.50" min="${v}" value="${v}" id="inputValCheckinAdicional_${item.id}" class="form-control" 
                           style="width: 70px; padding: 2px 4px; font-size: 11px; text-align: right;" 
                           ${!isAPartir ? 'disabled' : 'readonly'}>
                </div>
            </div>
        `;
    });
}

function toggleInputAdicionalCheckin(id) {
    const chk = document.querySelector(`.chk-checkin-adicional[value="${id}"]`);
    const inputVal = document.getElementById(`inputValCheckinAdicional_${id}`);
    if (chk && inputVal) {
        const itemObj = servicosAdicionais.find(s => s.id === id);
        if (itemObj && itemObj.a_partir) {
            inputVal.readOnly = !chk.checked;
        }
    }
}

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
        if (!client) return;

        const { data: tutorData, error: errTutor } = await client
            .from('tutores')
            .insert([{ nome: tutorNome, telefone: tutorFone }])
            .select('*');

        if (errTutor) {
            alert('Erro ao cadastrar Tutor: ' + errTutor.message);
            return;
        }

        const tutorId = tutorData[0].id;

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
            return;
        }

        alert('Tutor e Pet cadastrados com sucesso!');
        document.getElementById('formCadastro').reset();
        switchTab('atendimentos');

    } catch (err) {
        alert('Ocorreu um erro inesperado: ' + err.message);
    }
}

async function salvarCheckin() {
    if (!validarCaixaAberto()) return;

    try {
        const client = getSupabase();
        if (!client) return;

        const petSelect = document.getElementById('selectPetCheckin');
        const atendenteSelect = document.getElementById('selectAtendenteCheckin');

        if (!petSelect || !petSelect.value) {
            alert('Selecione um pet para realizar o check-in.');
            return;
        }

        if (!atendenteSelect || !atendenteSelect.value) {
            alert('Selecione o atendente responsável pelo check-in.');
            return;
        }

        const petId = parseInt(petSelect.value);
        const atendenteId = parseInt(atendenteSelect.value);
        const tipo = document.getElementById('selectTipoCobranca').value;
        const servico = document.getElementById('selectServico').value;
        const selectEntregaElem = document.getElementById('selectTipoEntrega');
        const tipoEntrega = selectEntregaElem ? selectEntregaElem.value : 'retirada';
        let valor = tipo === 'avulso' ? parseFloat(document.getElementById('valorAvulso').value) || 0 : 0;

        const chkAdicionais = document.querySelectorAll('.chk-checkin-adicional:checked');
        let listaAdicionais = [];
        let valorTotalAdicionais = 0;
        let erroPrecoMinimo = false;

        chkAdicionais.forEach(chk => {
            const id = chk.value;
            const minPreco = parseFloat(chk.getAttribute('data-min-preco')) || 0;
            const inputVal = document.getElementById(`inputValCheckinAdicional_${id}`);
            const valorFinal = inputVal ? parseFloat(inputVal.value) || 0 : minPreco;

            if (valorFinal < minPreco) {
                alert(`O valor do adicional ${chk.getAttribute('data-nome')} não pode ser menor que R$ ${minPreco.toFixed(2)}.`);
                erroPrecoMinimo = true;
                return;
            }

            const n = chk.getAttribute('data-nome');
            listaAdicionais.push({ id: id, nome: n, preco: valorFinal });
            valorTotalAdicionais += valorFinal;
        });

        if (erroPrecoMinimo) return;

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

            if (valorTotalAdicionais > 0) {
                const petObj = cadastros.find(p => p.id === petId);
                await client
                    .from('caixa_lancamentos')
                    .insert([{
                        descricao: `Adicionais de Pacote (${listaAdicionais.map(a => `${a.nome} R$ ${parseFloat(a.preco).toFixed(2)}`).join(', ')}) - ${petObj ? petObj.nome : ''}`,
                        forma_pagamento: "PIX",
                        valor: valorTotalAdicionais,
                        atendente_id: atendenteId
                    }]);
            }
        } else {
            const petObj = cadastros.find(p => p.id === petId);
            const pagtoInput = document.getElementById('pagamentoAvulso');
            const totalComAdicionais = valor + valorTotalAdicionais;

            await client
                .from('caixa_lancamentos')
                .insert([{
                    descricao: `Atendimento Avulso ${listaAdicionais.length > 0 ? '+ Adicionais' : ''} - ${petObj ? petObj.nome : ''}`,
                    forma_pagamento: pagtoInput ? pagtoInput.value : "PIX",
                    valor: totalComAdicionais,
                    atendente_id: atendenteId
                }]);
        }

        const { error: errAtend } = await client
            .from('atendimentos')
            .insert([{
                pet_id: petId,
                servico: servico,
                tipo: tipo,
                tipo_entrega: tipoEntrega,
                status: 'em_andamento',
                valor: valor + valorTotalAdicionais,
                servicos_adicionais: listaAdicionais,
                atendente_checkin_id: atendenteId
            }]);

        if (errAtend) {
            alert('Erro ao gravar Atendimento no Supabase: ' + errAtend.message);
            return;
        }

        closeModal('modalAtendimento');
        alert('Check-in realizado com sucesso!');
        await carregarDadosAtendimentos();

    } catch (e) {
        alert('Erro ao salvar check-in: ' + e.message);
    }
}

async function salvarVendaPacote() {
    if (!validarCaixaAberto()) return;

    try {
        const client = getSupabase();
        if (!client) return;

        const petId = parseInt(document.getElementById('selectPetPacote').value);
        const atendenteId = document.getElementById('selectAtendenteVendaPacote').value;
        const qtd = parseInt(document.getElementById('qtdBanhosPacote').value);
        const valor = parseFloat(document.getElementById('valorPacote').value);
        const forma = document.getElementById('pagamentoPacote').value;

        if (!atendenteId) {
            alert('Selecione o atendente vendedor.');
            return;
        }

        const petObj = cadastros.find(p => p.id === petId);

        const dataHoje = new Date();
        dataHoje.setDate(dataHoje.getDate() + 30);
        const dataValidade = dataHoje.toISOString().split('T')[0];

        await client
            .from('pacotes')
            .insert([{
                pet_id: petId,
                quantidade_total: qtd,
                quantidade_usada: 0,
                status: 'ativo',
                data_validade: dataValidade
            }]);

        await client
            .from('caixa_lancamentos')
            .insert([{
                descricao: `Venda Pacote (${qtd} Banhos) - ${petObj ? petObj.nome : ''}`,
                forma_pagamento: forma,
                valor: valor,
                atendente_id: parseInt(atendenteId)
            }]);

        closeModal('modalPacote');
        alert('Pacote cadastrado com validade de 30 dias e lançado no caixa!');
        await carregarDadosAtendimentos();
    } catch (e) {
        alert('Erro ao vender pacote: ' + e.message);
    }
}

function filterServices(tipo, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAtendimentos(tipo);
}

async function checarStatusCaixa() {
    try {
        const client = getSupabase();
        if (!client) return;

        const { data, error } = await client
            .from('caixa_sessoes')
            .select('*')
            .eq('status', 'aberto')
            .order('data_abertura', { ascending: false })
            .limit(1);

        const btnAbrir = document.getElementById('btnAbrirCaixa');
        const btnFechar = document.getElementById('btnFecharCaixa');
        const btnSangria = document.getElementById('btnSangriaCaixa');

        const isAdmin = usuarioLogado && usuarioLogado.perfil === 'admin';

        if (!error && data && data.length > 0) {
            caixaAtualSessao = data[0];
            if (btnAbrir) btnAbrir.style.display = 'none';
            if (btnFechar) btnFechar.style.display = isAdmin ? 'inline-block' : 'none';
            if (btnSangria) btnSangria.style.display = isAdmin ? 'inline-block' : 'none';
        } else {
            caixaAtualSessao = null;
            if (btnAbrir) btnAbrir.style.display = isAdmin ? 'inline-block' : 'none';
            if (btnFechar) btnFechar.style.display = 'none';
            if (btnSangria) btnSangria.style.display = 'none';
        }
    } catch (e) {
        console.error('Erro ao checar caixa:', e);
    }
}

async function confirmarAberturaCaixa() {
    if (!validarPermissaoAdmin()) return;

    try {
        const client = getSupabase();
        const valorFundo = parseFloat(document.getElementById('valorFundoInicial').value) || 0;

        const { error } = await client
            .from('caixa_sessoes')
            .insert([{
                valor_inicial: valorFundo,
                status: 'aberto'
            }]);

        if (error) {
            alert('Erro ao abrir caixa: ' + error.message);
            return;
        }

        closeModal('modalAbrirCaixa');
        alert('Caixa aberto com sucesso!');
        await checarStatusCaixa();
    } catch (e) {
        alert('Erro: ' + e.message);
    }
}

async function confirmarSangriaCaixa() {
    if (!validarPermissaoAdmin()) return;
    if (!caixaAtualSessao) {
        alert('Nenhum caixa aberto no momento.');
        return;
    }

    const valorInput = document.getElementById('valorSangriaInput');
    const motivoInput = document.getElementById('motivoSangriaInput');

    const valor = parseFloat(valorInput.value) || 0;
    const motivo = motivoInput.value.trim();

    if (valor <= 0) {
        alert('Informe um valor válido para a sangria.');
        return;
    }

    if (!motivo) {
        alert('Informe o motivo ou descrição da sangria.');
        return;
    }

    try {
        const client = getSupabase();
        if (!client) return;

        const { error: errLanc } = await client
            .from('caixa_lancamentos')
            .insert([{
                descricao: `[SANGRIA] ${motivo}`,
                forma_pagamento: 'Dinheiro',
                valor: -valor
            }]);

        if (errLanc) {
            alert('Erro ao registrar sangria: ' + errLanc.message);
            return;
        }

        const novoTotalSangrias = (parseFloat(caixaAtualSessao.total_sangrias) || 0) + valor;
        await client
            .from('caixa_sessoes')
            .update({ total_sangrias: novoTotalSangrias })
            .eq('id', caixaAtualSessao.id);

        closeModal('modalSangriaCaixa');
        valorInput.value = '';
        motivoInput.value = '';

        alert(`Sangria de R$ ${valor.toFixed(2)} realizada com sucesso!`);
        await carregarCaixa();
        await checarStatusCaixa();

    } catch (e) {
        alert('Erro ao realizar sangria: ' + e.message);
    }
}

async function confirmarFechamentoCaixa() {
    if (!validarPermissaoAdmin()) return;

    try {
        if (!caixaAtualSessao) {
            alert('Nenhum caixa aberto no momento.');
            return;
        }

        const client = getSupabase();
        const informado = parseFloat(document.getElementById('valorGavetaInformado').value) || 0;

        let totalDinheiroVendas = 0;
        caixaLancamentos.forEach(c => {
            if ((c.forma_pagamento || '').toLowerCase().includes('dinheiro') && c.status !== 'cancelado') {
                totalDinheiroVendas += parseFloat(c.valor || 0);
            }
        });

        const totalSangrias = parseFloat(caixaAtualSessao.total_sangrias) || 0;
        const esperado = (parseFloat(caixaAtualSessao.valor_inicial) + totalDinheiroVendas) - totalSangrias;
        const diferenca = informado - esperado;

        const { error } = await client
            .from('caixa_sessoes')
            .update({
                data_fechamento: new Date().toISOString(),
                valor_final_informado: informado,
                valor_esperado: esperado,
                diferenca: diferenca,
                status: 'fechado'
            })
            .eq('id', caixaAtualSessao.id);

        if (error) {
            alert('Erro ao fechar caixa: ' + error.message);
            return;
        }

        closeModal('modalFecharCaixa');

        let msgResumo = `Caixa Encerrado com Sucesso!\n\n`;
        msgResumo += `• Fundo Inicial: R$ ${parseFloat(caixaAtualSessao.valor_inicial).toFixed(2)}\n`;
        msgResumo += `• Sangrias Retiradas: R$ ${totalSangrias.toFixed(2)}\n`;
        msgResumo += `• Esperado em Dinheiro: R$ ${esperado.toFixed(2)}\n`;
        msgResumo += `• Informado na Gaveta: R$ ${informado.toFixed(2)}\n`;
        msgResumo += `• Diferença: R$ ${diferenca.toFixed(2)}`;

        alert(msgResumo);
        await checarStatusCaixa();
    } catch (e) {
        alert('Erro ao encerrar caixa: ' + e.message);
    }
}

function verificarSessaoUsuario() {
    const sessaoSalva = sessionStorage.getItem('petz_usuario');
    const modal = document.getElementById('modalLogin');

    if (sessaoSalva) {
        usuarioLogado = JSON.parse(sessaoSalva);
        if (modal) modal.style.display = 'none';
        aplicarPermissoesPerfil();
    } else {
        if (modal) modal.style.display = 'flex';
    }
}

async function realizarLogin(e) {
    if (e) e.preventDefault();

    const emailInput = document.getElementById('loginEmail');
    const senhaInput = document.getElementById('loginSenha');

    if (!emailInput || !senhaInput) return;

    const email = emailInput.value.trim();
    const senha = senhaInput.value.trim();

    try {
        const client = getSupabase();
        if (!client) return;

        const { data, error } = await client
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .eq('senha', senha);

        if (error || !data || data.length === 0) {
            alert('E-mail ou senha inválidos!');
            return;
        }

        usuarioLogado = data[0];
        sessionStorage.setItem('petz_usuario', JSON.stringify(usuarioLogado));

        const modal = document.getElementById('modalLogin');
        if (modal) modal.style.display = 'none';

        document.getElementById('formLogin').reset();
        aplicarPermissoesPerfil();
        await checarStatusCaixa();
        alert(`Bem-vindo(a), ${usuarioLogado.nome}!`);

    } catch (err) {
        alert('Erro ao realizar login: ' + err.message);
    }
}

function fazerLogout() {
    if (confirm('Deseja realmente sair do sistema?')) {
        sessionStorage.removeItem('petz_usuario');
        usuarioLogado = null;
        window.location.reload();
    }
}

function aplicarPermissoesPerfil() {
    if (!usuarioLogado) return;

    const displayInfo = document.getElementById('userInfoDisplay');
    const btnLogout = document.getElementById('btnLogout');
    const userName = document.getElementById('userName');
    const badgeRole = document.getElementById('userRoleBadge');

    if (displayInfo) displayInfo.style.display = 'block';
    if (btnLogout) btnLogout.style.display = 'inline-block';
    if (userName) userName.innerText = escapeHtml(usuarioLogado.nome);

    const isAdmin = usuarioLogado.perfil === 'admin';

    if (badgeRole) {
        badgeRole.innerText = isAdmin ? 'Administrador' : 'Atendente';
        badgeRole.style.background = isAdmin ? '#6a1b9a' : '#2e7d32';
    }

    const btnSalvarTabelaPrecos = document.querySelector('button[onclick="salvarPrecosAdicionais()"]');
    if (btnSalvarTabelaPrecos) {
        btnSalvarTabelaPrecos.style.display = isAdmin ? 'inline-block' : 'none';
    }

    const panelAtendentesForm = document.getElementById('formCadastroAtendente');
    if (panelAtendentesForm) {
        panelAtendentesForm.style.display = isAdmin ? 'block' : 'none';
    }

    const inputsPreco = document.querySelectorAll('.input-preco-adicional');
    inputsPreco.forEach(input => {
        input.disabled = !isAdmin;
    });

    const chksAPartir = document.querySelectorAll('.chk-a-partir-adicional');
    chksAPartir.forEach(chk => {
        chk.disabled = !isAdmin;
    });

    checarStatusCaixa();
}

function validarPermissaoAdmin() {
    if (!usuarioLogado || usuarioLogado.perfil !== 'admin') {
        alert('Acesso Negado: Esta operação requer privilégios de Administrador.');
        return false;
    }
    return true;
}

async function carregarHistoricoCaixas() {
    const container = document.getElementById('historicoCaixasContainer');
    if (!container) return;

    try {
        const client = getSupabase();
        if (!client) return;

        const { data, error } = await client
            .from('caixa_sessoes')
            .select('*')
            .order('data_abertura', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Erro ao buscar histórico de caixas:', error);
            return;
        }

        if (!data || data.length === 0) {
            container.innerHTML = `<p style="text-align:center; color:#888; padding:15px;">Nenhum caixa encerrado até o momento.</p>`;
            return;
        }

        container.innerHTML = '';
        data.forEach(sessao => {
            const dataAbertura = new Date(sessao.data_abertura).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const dataFechamento = sessao.data_fechamento ? new Date(sessao.data_fechamento).toLocaleDateString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Em Aberto';
            const isAberto = sessao.status === 'aberto';
            const diferenca = parseFloat(sessao.diferenca || 0);

            let corDiferenca = '#666';
            if (diferenca < 0) corDiferenca = '#d32f2f';
            if (diferenca > 0) corDiferenca = '#2e7d32';

            container.innerHTML += `
                <div style="background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 12px; margin-bottom: 10px; font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <strong>Abertura: ${dataAbertura}</strong>
                        <span class="badge ${isAberto ? 'badge-pacote' : 'badge-avulso'}" style="background: ${isAberto ? '#e3f2fd' : '#f5f5f5'}; color: ${isAberto ? '#1976d2' : '#616161'};">
                            ${isAberto ? 'Sessão Ativa' : 'Encerrado às ' + dataFechamento}
                        </span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; color: #555;">
                        <div>Troco Inicial: <strong>R$ ${parseFloat(sessao.valor_inicial || 0).toFixed(2)}</strong></div>
                        <div>Sangrias: <strong style="color:#d32f2f;">R$ ${parseFloat(sessao.total_sangrias || 0).toFixed(2)}</strong></div>
                        <div>Esperado Dinheiro: <strong>R$ ${parseFloat(sessao.valor_esperado || 0).toFixed(2)}</strong></div>
                        <div>Informado Gaveta: <strong>R$ ${parseFloat(sessao.valor_final_informado || 0).toFixed(2)}</strong></div>
                        <div>Diferença: <strong style="color: ${corDiferenca}">R$ ${diferenca.toFixed(2)}</strong></div>
                    </div>
                </div>
            `;
        });

    } catch (e) {
        console.error('Erro ao carregar histórico:', e);
    }
}

// TRAVAS DE SEGURANÇA NO FRONT-END
document.addEventListener('contextmenu', event => event.preventDefault());

document.onkeydown = function (e) {
    if (e.keyCode == 123 ||
        (e.ctrlKey && e.shiftKey && (e.keyCode == 73 || e.keyCode == 74)) ||
        (e.ctrlKey && e.keyCode == 85)) {
        return false;
    }
};

// INICIALIZAÇÃO
window.addEventListener('DOMContentLoaded', () => {
    verificarSessaoUsuario();
    carregarDadosAtendimentos();
    checarStatusCaixa();
});