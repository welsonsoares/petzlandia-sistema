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

let cadastros = [];
let pacotes = [];
let atendimentos = [];
let caixaLancamentos = [];
let servicosAdicionais = [];
let atendentes = [];
let caixaAtualSessao = null;
let usuarioLogado = null;

// TRAVA DE SEGURANÇA: VALIDAR SE O CAIXA ESTÁ ABERTO
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
    }
    if (tabId === 'caixa') {
        carregarCaixa();
        carregarHistoricoCaixas();
    }
}

// 1. CARREGAR ATENDIMENTOS, PACOTES, ADICIONAIS E ATENDENTES DO SUPABASE
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

// CARREGAR CATÁLOGO DE ATENDENTES / USUÁRIOS
async function carregarAtendentes() {
    try {
        const client = getSupabase();
        if (!client) return;

        // Busca tanto da tabela de atendentes quanto de usuários
        const { data: dataAtend } = await client.from('atendentes').select('*').eq('ativo', true).order('nome');
        const { data: dataUser } = await client.from('usuarios').select('id, nome, perfil, email').order('nome');

        let listaUnificada = [];
        if (dataAtend) {
            dataAtend.forEach(a => listaUnificada.push({ id: a.id, nome: a.nome, perfil: 'atendente' }));
        }

        if (dataUser) {
            dataUser.forEach(u => {
                if (!listaUnificada.some(a => a.nome.toLowerCase() === u.nome.toLowerCase())) {
                    listaUnificada.push({ id: u.id, nome: u.nome, perfil: u.perfil });
                }
            });
        }

        atendentes = listaUnificada;
        popularSelectsAtendentes();
        renderListaAtendentes();

    } catch (e) {
        console.error('Erro ao carregar atendentes/usuários:', e);
    }
}

// POPULAR SELECTS DE ATENDENTES NOS MODAIS E PRÉ-SELEÇÃO AUTOMÁTICA DO USUÁRIO LOGADO
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

                el.innerHTML += `<option value="${a.id}">${a.nome}</option>`;
            });

            // Se encontrou o atendente correspondente ao usuário logado, seleciona automaticamente
            if (idAtendenteEncontrado) {
                el.value = idAtendenteEncontrado;
            }
        }
    });
}

// CADASTRAR NOVO USUÁRIO / ATENDENTE COM CREDENCIAIS DE ACESSO
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

        // 1. Inserir na tabela de usuários para login
        const { error: errUser } = await client
            .from('usuarios')
            .insert([{ nome, email, senha, perfil }]);

        if (errUser) {
            alert('Erro ao cadastrar Usuário: ' + errUser.message);
            return;
        }

        // 2. Inserir na tabela de atendentes para vínculo nas operações
        await client.from('atendentes').insert([{ nome, ativo: true }]);

        document.getElementById('formCadastroAtendente').reset();
        alert(`Usuário/Atendente ${nome} cadastrado com sucesso!`);
        await carregarAtendentes();

    } catch (e) {
        alert('Erro ao cadastrar: ' + e.message);
    }
}

// RENDERIZAR LISTA DE ATENDENTES NA ABA CADASTROS
function renderListaAtendentes() {
    const container = document.getElementById('listaAtendentesContainer');
    if (!container) return;

    container.innerHTML = '';
    atendentes.forEach(a => {
        const isAdm = a.perfil === 'admin';
        container.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px dashed #eee; font-size: 12px;">
                <span><i class="fa-solid ${isAdm ? 'fa-user-shield' : 'fa-user-check'}" style="color:var(--purple-main);"></i> ${a.nome}</span>
                <span class="badge ${isAdm ? 'badge-pacote' : 'badge-avulso'}" style="background:${isAdm ? '#f3e5f5' : '#e8f5e9'}; color:${isAdm ? '#6a1b9a' : '#2e7d32'}; font-size:10px;">
                    ${isAdm ? 'Administrador' : 'Atendente'}
                </span>
            </div>
        `;
    });
}

// CARREGAR CATÁLOGO DE SERVIÇOS ADICIONAIS
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

// 2. RENDERIZAR PAINEL DE PETS PRESENTES
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

        if (item.pets) {
            petNome = item.pets.nome || petNome;
            if (item.pets.tutores) {
                tutorNome = item.pets.tutores.nome || tutorNome;
                tutorFone = item.pets.tutores.telefone || '';
            }
        }

        if (petNome === 'Pet Sem Nome' && item.pet_id) {
            const localPet = cadastros.find(c => c.id === item.pet_id);
            if (localPet) {
                petNome = localPet.nome;
                if (localPet.tutores) {
                    tutorNome = localPet.tutores.nome;
                    tutorFone = localPet.tutores.telefone || '';
                }
            }
        }

        const hora = item.data_entrada ? new Date(item.data_entrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
        const isPronto = (item.status || '').toLowerCase().trim() === 'pronto';
        const tipoEntrega = item.tipo_entrega || 'retirada';
        const textoEntrega = tipoEntrega === 'entrega' ? 'Delivery / Táxi Pet' : 'Retirada na Loja';

        let adicionaisTexto = '';
        if (item.servicos_adicionais && Array.isArray(item.servicos_adicionais) && item.servicos_adicionais.length > 0) {
            adicionaisTexto = `<br><span style="color: #6a1b9a; font-size:11px;">+ Adicionais: ${item.servicos_adicionais.map(s => s.nome).join(', ')}</span>`;
        }

        let tagCheckin = item.atendente_checkin ? `<span class="badge" style="background:#f3e5f5; color:#6a1b9a; font-size:10px; margin-left:4px;"><i class="fa-solid fa-user-plus"></i> In: ${item.atendente_checkin.nome}</span>` : '';
        let tagCheckout = item.atendente_checkout ? `<span class="badge" style="background:#e8f5e9; color:#2e7d32; font-size:10px; margin-left:4px;"><i class="fa-solid fa-user-check"></i> Out: ${item.atendente_checkout.nome}</span>` : '';

        list.innerHTML += `
            <div class="service-item" style="flex-direction:column; align-items:stretch; gap:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="pet-info">
                        <div class="pet-icon" style="background:${isPronto ? '#e8f5e9' : '#f0eaf4'}; color:${isPronto ? '#2e7d32' : 'var(--purple-main)'};">
                            <i class="fa-solid ${isPronto ? 'fa-circle-check' : 'fa-dog'}"></i>
                        </div>
                        <div>
                            <strong>${petNome}</strong> <small>(${tutorNome})</small> ${tagCheckin} ${tagCheckout}
                            <p style="font-size:11px; color:#666;">${item.servico} • ${textoEntrega} • Entrou às ${hora} ${adicionaisTexto}</p>
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
                        <button class="btn btn-sm" style="background:#25D366; color:#fff;" onclick="notificarWhatsapp('${tutorNome}', '${tutorFone}', '${petNome}', '${tipoEntrega}')">
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

// 3. ALTERAR STATUS DE ATENDIMENTO
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

// ABRIR MODAL DE CHECK-OUT COM ATENDENTE LOGADO PRÉ-SELECIONADO AUTOMATICAMENTE
function abrirModalCheckout(atendimentoId) {
    document.getElementById('checkoutAtendimentoId').value = atendimentoId;
    openModal('modalCheckout');
}

// CONFIRMAR CHECK-OUT REGISTRANDO O ATENDENTE
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

// 4. NOTIFICAÇÃO DINÂMICA VIA WHATSAPP
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
                    <strong>${petNome} <small>(${tutorNome})</small></strong>
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

        const { data, error } = await client
            .from('caixa_lancamentos')
            .select(`
                *,
                atendentes:atendente_id ( nome )
            `)
            .order('data_lancamento', { ascending: false });

        if (!error) caixaLancamentos = data || [];
        renderCaixa();
    } catch (e) {
        console.error('Erro ao carregar caixa:', e);
    }
}

// RENDERIZAR CAIXA COM RESTRIÇÃO E GOVERNANÇA DE PERFIS
function renderCaixa() {
    const list = document.getElementById('caixaLancamentos');
    if (!list) return;
    list.innerHTML = '';

    let total = 0, pix = 0, outros = 0;
    const isAdmin = usuarioLogado && usuarioLogado.perfil === 'admin';

    caixaLancamentos.forEach(c => {
        const v = parseFloat(c.valor || 0);
        const isCancelado = c.status === 'cancelado';
        const isSangria = v < 0;

        if (!isCancelado) {
            total += v;
            if (c.forma_pagamento === 'PIX') pix += v;
            else outros += v;
        }

        let corValor = isSangria ? '#d32f2f' : 'var(--green-badge)';
        if (isCancelado) corValor = '#9e9e9e';

        let nomeAtend = c.atendentes ? c.atendentes.nome : (usuarioLogado ? usuarioLogado.nome : 'Sistema');

        list.innerHTML += `
            <div class="service-item" style="${isCancelado ? 'opacity: 0.55; background: #f5f5f5;' : ''}">
                <div>
                    <strong>${c.descricao} ${isCancelado ? '<small style="color: #d32f2f; font-weight:bold;">(CANCELADO)</small>' : ''}</strong>
                    <p style="font-size:11px; color:#666;">Forma de Pagamento: ${c.forma_pagamento} <span style="color: #6a1b9a; font-weight: 500;">• Op: ${nomeAtend}</span></p>
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

// ESTORNAR LANÇAMENTO (EXCLUSIVO ADMIN)
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

// EXPORTAR CAIXA CSV
function exportarCaixaCSV() {
    if (!caixaLancamentos || caixaLancamentos.length === 0) {
        alert('Não há lançamentos no caixa para exportar.');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,ID;Descricao;Forma Pagamento;Atendente;Valor;Status;Data\n";

    caixaLancamentos.forEach(c => {
        const dataFormatada = c.data_lancamento
            ? new Date(c.data_lancamento).toLocaleString('pt-BR')
            : '';
        const nomeAtend = c.atendentes ? c.atendentes.nome : 'Sistema';
        const linha = `${c.id};"${c.descricao}";${c.forma_pagamento};"${nomeAtend}";${parseFloat(c.valor || 0).toFixed(2)};${c.status || 'ativo'};${dataFormatada}`;
        csvContent += linha + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);

    const dataHoje = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `fechamento_caixa_${dataHoje}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// IMPRIMIR RELATÓRIO DO CAIXA
function imprimirRelatorioCaixa() {
    if (!caixaLancamentos || caixaLancamentos.length === 0) {
        alert('Não há dados de caixa para gerar relatório.');
        return;
    }

    let total = 0, pix = 0, dinheiro = 0, cartao = 0;

    caixaLancamentos.forEach(c => {
        if (c.status !== 'cancelado') {
            const v = parseFloat(c.valor || 0);
            total += v;
            const forma = (c.forma_pagamento || '').toLowerCase();
            if (forma === 'pix') pix += v;
            else if (forma === 'dinheiro') dinheiro += v;
            else cartao += v;
        }
    });

    const janelaImpressao = window.open('', '', 'width=800,height=600');
    janelaImpressao.document.write(`
        <html>
        <head>
            <title>Relatório de Fechamento de Caixa - Petz Lândia</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                h2 { color: #6a1b9a; margin-bottom: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                th { background-color: #f0eaf4; }
                .resumo { margin-top: 15px; background: #fafafa; padding: 10px; border-radius: 5px; }
                .cancelado { text-decoration: line-through; color: #888; }
            </style>
        </head>
        <body>
            <h2>Petz Lândia - Extrato de Caixa</h2>
            <p>Data do Relatório: ${new Date().toLocaleString('pt-BR')}</p>
            
            <div class="resumo">
                <strong>Resumo do Faturamento:</strong><br>
                • Total Faturado: R$ ${total.toFixed(2)}<br>
                • Total em PIX: R$ ${pix.toFixed(2)}<br>
                • Total em Dinheiro: R$ ${dinheiro.toFixed(2)}<br>
                • Total em Cartão: R$ ${cartao.toFixed(2)}
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Descrição</th>
                        <th>Atendente</th>
                        <th>Pagamento</th>
                        <th>Valor (R$)</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${caixaLancamentos.map(c => `
                        <tr class="${c.status === 'cancelado' ? 'cancelado' : ''}">
                            <td>${c.descricao}</td>
                            <td>${c.atendentes ? c.atendentes.nome : 'Sistema'}</td>
                            <td>${c.forma_pagamento}</td>
                            <td>R$ ${parseFloat(c.valor || 0).toFixed(2)}</td>
                            <td>${c.status || 'ativo'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
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
    selCheckin.innerHTML = ''; selPacote.innerHTML = '';
    if (selAdicional) selAdicional.innerHTML = '';

    try {
        const client = getSupabase();
        if (!client) return;

        const { data, error } = await client
            .from('pets')
            .select(`id, nome, tutores ( nome, telefone )`);

        if (!error && data) {
            cadastros = data;
            data.forEach(p => {
                const tutorNome = p.tutores ? p.tutores.nome : '';
                const opt = `<option value="${p.id}">${p.nome} (${tutorNome})</option>`;
                selCheckin.innerHTML += opt;
                selPacote.innerHTML += opt;
                if (selAdicional) selAdicional.innerHTML += opt;
            });
        }
    } catch (e) {
        console.error('Erro ao popular selects:', e);
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

// CONTROLAR ABERTURA DE MODAIS COM TRAVA DE CAIXA FECHADO
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
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// TABELA DE PRECIFICAÇÃO DE ADICIONAIS
async function carregarTabelaPrecosAdicionais() {
    const container = document.getElementById('tabelaPrecosAdicionaisContainer');
    if (!container) return;

    await carregarCatalogoAdicionais();
    container.innerHTML = '';

    servicosAdicionais.forEach(item => {
        container.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px dashed #eee; padding-bottom: 5px;">
                <span style="font-size: 13px; font-weight: 500;">${item.nome}</span>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="font-size: 12px; color: #555;">R$</span>
                    <input type="number" step="0.50" min="0" class="form-control input-preco-adicional" data-id="${item.id}" value="${parseFloat(item.preco || 0).toFixed(2)}" style="width: 85px; padding: 4px 8px; font-size: 12px;">
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

        const inputs = document.querySelectorAll('.input-preco-adicional');
        for (let input of inputs) {
            const id = parseInt(input.getAttribute('data-id'));
            const novoPreco = parseFloat(input.value) || 0;

            await client
                .from('servicos_adicionais')
                .update({ preco: novoPreco })
                .eq('id', id);
        }

        alert('Tabela de preços atualizada com sucesso!');
        await carregarCatalogoAdicionais();
    } catch (e) {
        alert('Erro ao salvar preços: ' + e.message);
    }
}

// VENDAS AVULSAS DE ADICIONAIS
function renderVendaAdicionaisLista() {
    const container = document.getElementById('vendaAdicionaisListaContainer');
    if (!container) return;
    container.innerHTML = '';

    servicosAdicionais.forEach(item => {
        const v = parseFloat(item.preco || 0).toFixed(2);
        container.innerHTML += `
            <label style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 4px 0; cursor: pointer;">
                <span>
                    <input type="checkbox" class="chk-venda-adicional" value="${item.id}" data-preco="${v}" data-nome="${item.nome}" onchange="calcularTotalVendaAdicional()"> ${item.nome}
                </span>
                <strong style="color: var(--purple-main);">R$ ${v}</strong>
            </label>
        `;
    });
    calcularTotalVendaAdicional();
}

function calcularTotalVendaAdicional() {
    const checkboxes = document.querySelectorAll('.chk-venda-adicional:checked');
    let total = 0;
    checkboxes.forEach(chk => {
        total += parseFloat(chk.getAttribute('data-preco')) || 0;
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
        checkboxes.forEach(chk => {
            total += parseFloat(chk.getAttribute('data-preco')) || 0;
            nomes.push(chk.getAttribute('data-nome'));
        });

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

// CHECK-IN COM ADICIONAIS E ATENDENTE AUTOMÁTICO
function renderCheckinAdicionais() {
    const container = document.getElementById('checkinAdicionaisContainer');
    if (!container) return;
    container.innerHTML = '';

    servicosAdicionais.forEach(item => {
        const v = parseFloat(item.preco || 0).toFixed(2);
        container.innerHTML += `
            <label style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding: 3px 0; cursor: pointer;">
                <span>
                    <input type="checkbox" class="chk-checkin-adicional" value="${item.id}" data-preco="${v}" data-nome="${item.nome}"> ${item.nome}
                </span>
                <span style="color: #666;">+ R$ ${v}</span>
            </label>
        `;
    });
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

// SALVAR CHECK-IN COM VÍNCULO DE ATENDENTE
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

        chkAdicionais.forEach(chk => {
            const p = parseFloat(chk.getAttribute('data-preco')) || 0;
            const n = chk.getAttribute('data-nome');
            listaAdicionais.push({ id: chk.value, nome: n, preco: p });
            valorTotalAdicionais += p;
        });

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
                        descricao: `Adicionais de Pacote (${listaAdicionais.map(a => a.nome).join(', ')}) - ${petObj ? petObj.nome : ''}`,
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

// VERIFICAR STATUS DO CAIXA NO BANCO E APLICAR RESTRIÇÕES DE PERFIL DE ACESSO
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
            // Apenas administradores veem botões de fechar caixa e sangria
            if (btnFechar) btnFechar.style.display = isAdmin ? 'inline-block' : 'none';
            if (btnSangria) btnSangria.style.display = isAdmin ? 'inline-block' : 'none';
        } else {
            caixaAtualSessao = null;
            // Apenas administradores veem o botão de abrir caixa
            if (btnAbrir) btnAbrir.style.display = isAdmin ? 'inline-block' : 'none';
            if (btnFechar) btnFechar.style.display = 'none';
            if (btnSangria) btnSangria.style.display = 'none';
        }
    } catch (e) {
        console.error('Erro ao checar caixa:', e);
    }
}

// CONFIRMAR ABERTURA DE CAIXA (EXCLUSIVO ADMIN)
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

// CONFIRMAR SANGRIA DE CAIXA (EXCLUSIVO ADMIN)
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

// CONFIRMAR FECHAMENTO CEGO DE CAIXA (EXCLUSIVO ADMIN)
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
            if ((c.forma_pagamento || '').toLowerCase() === 'dinheiro' && c.status !== 'cancelado') {
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

// CHECAR SESSÃO DE USUÁRIO
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

// REALIZAR LOGIN NO SUPABASE
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

// LOGOUT
function fazerLogout() {
    if (confirm('Deseja realmente sair do sistema?')) {
        sessionStorage.removeItem('petz_usuario');
        usuarioLogado = null;
        window.location.reload();
    }
}

// APLICAR PERMISSÕES DINÂMICAS DE SEGURANÇA E VISIBILIDADE DE BOTÕES
function aplicarPermissoesPerfil() {
    if (!usuarioLogado) return;

    const displayInfo = document.getElementById('userInfoDisplay');
    const btnLogout = document.getElementById('btnLogout');
    const userName = document.getElementById('userName');
    const badgeRole = document.getElementById('userRoleBadge');

    if (displayInfo) displayInfo.style.display = 'block';
    if (btnLogout) btnLogout.style.display = 'inline-block';
    if (userName) userName.innerText = usuarioLogado.nome;

    const isAdmin = usuarioLogado.perfil === 'admin';

    if (badgeRole) {
        badgeRole.innerText = isAdmin ? 'Administrador' : 'Atendente';
        badgeRole.style.background = isAdmin ? '#6a1b9a' : '#2e7d32';
    }

    // Botões e seções exclusivas de Admin na aba de cadastros
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

    checarStatusCaixa();
}

function validarPermissaoAdmin() {
    if (!usuarioLogado || usuarioLogado.perfil !== 'admin') {
        alert('Acesso Negado: Esta operação requer privilégios de Administrador.');
        return false;
    }
    return true;
}

// HISTÓRICO DE CAIXAS
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

// INICIALIZAÇÃO
window.addEventListener('DOMContentLoaded', () => {
    verificarSessaoUsuario();
    carregarDadosAtendimentos();
    checarStatusCaixa();
});