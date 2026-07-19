"""
Gerador de Recibo (requisito 4 — "Gerador de Recibo").

Produz um HTML autocontido, pronto para impressão (Ctrl+P / salvar como PDF),
com dados da loja, dados do cliente, itens comprados, termo de garantia e
campos de assinatura.
"""

from __future__ import annotations

import html

from mega_outlet.constants import DADOS_LOJA


def _moeda(valor: float) -> str:
    """Formata um número no padrão monetário brasileiro: R$ 1.234,56."""
    texto = f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {texto}"


def _data_br(data_iso: str) -> str:
    """Converte 'YYYY-MM-DD' para 'DD/MM/YYYY' (mantém o texto se não casar)."""
    partes = (data_iso or "").split("-")
    if len(partes) == 3:
        return f"{partes[2]}/{partes[1]}/{partes[0]}"
    return data_iso or ""


def gerar_recibo_html(dados_venda: dict, loja: dict = DADOS_LOJA) -> str:
    """
    Monta o recibo em HTML a partir do dicionário devolvido por
    `vendas.obter_venda(conn, id_venda)`.
    """
    venda = dados_venda["venda"]
    itens = dados_venda["itens"]
    forma_pagamento = dados_venda["forma_pagamento"]

    # Linhas da tabela de itens (com o termo de garantia de cada produto)
    linhas_itens = "\n".join(
        f"""
        <tr>
          <td>{html.escape(item["sku"])}</td>
          <td>{html.escape(item["descricao"])}<br>
              <small>Garantia: {html.escape(item["status_garantia"])}</small></td>
          <td class="num">{item["quantidade"]}</td>
          <td class="num">{_moeda(item["preco_unitario_aplicado"])}</td>
          <td class="num">{_moeda(item["subtotal"])}</td>
        </tr>
        """
        for item in itens
    )

    entrega = html.escape(venda["forma_entrega"])
    if venda["endereco_entrega"]:
        entrega += f" — {html.escape(venda['endereco_entrega'])}"

    observacoes_html = (
        f"""<div class="bloco observacoes">
              <strong>Observações / Termo de venda:</strong><br>
              {html.escape(venda["observacoes"]).replace(chr(10), "<br>")}
            </div>"""
        if venda["observacoes"]
        else ""
    )

    return f"""
<div class="recibo">
  <style>
    /* Estilo enxuto, pensado para impressão em folha A4 */
    .recibo {{ font-family: Arial, Helvetica, sans-serif; color: #111;
               max-width: 720px; margin: 0 auto; padding: 24px;
               background: #fff; }}
    .recibo h1 {{ font-size: 20px; margin: 0; }}
    .recibo h2 {{ font-size: 15px; margin: 18px 0 6px;
                  border-bottom: 1px solid #999; padding-bottom: 2px; }}
    .recibo .cabecalho {{ text-align: center; border-bottom: 2px solid #111;
                          padding-bottom: 10px; }}
    .recibo .cabecalho small {{ color: #444; }}
    .recibo table {{ width: 100%; border-collapse: collapse; margin-top: 6px; }}
    .recibo th, .recibo td {{ border: 1px solid #bbb; padding: 6px 8px;
                              font-size: 13px; text-align: left;
                              vertical-align: top; }}
    .recibo th {{ background: #f0f0f0; }}
    .recibo .num {{ text-align: right; white-space: nowrap; }}
    .recibo .total {{ font-size: 16px; font-weight: bold; text-align: right;
                      margin-top: 8px; }}
    .recibo .bloco {{ margin-top: 10px; font-size: 13px; }}
    .recibo .observacoes {{ border: 1px dashed #888; padding: 8px;
                            background: #fafafa; }}
    .recibo .assinaturas {{ display: flex; gap: 40px; margin-top: 56px; }}
    .recibo .assinaturas div {{ flex: 1; border-top: 1px solid #111;
                                text-align: center; padding-top: 4px;
                                font-size: 12px; }}
    @media print {{ body {{ margin: 0; }} }}
  </style>

  <div class="cabecalho">
    <h1>{html.escape(loja["nome"])}</h1>
    <small>
      CNPJ: {html.escape(loja["cnpj"])} &nbsp;|&nbsp;
      {html.escape(loja["endereco"])} &nbsp;|&nbsp;
      Tel: {html.escape(loja["telefone"])}
    </small>
  </div>

  <h2>Recibo de Venda Nº {venda["id_venda"]:06d}</h2>
  <div class="bloco">
    <strong>Data:</strong> {_data_br(venda["data_venda"])}<br>
    <strong>Cliente:</strong> {html.escape(venda["cliente_nome"])}<br>
    <strong>CPF:</strong> {html.escape(venda["cliente_cpf"] or "—")} &nbsp;|&nbsp;
    <strong>Telefone:</strong> {html.escape(venda["cliente_telefone"] or "—")}<br>
    <strong>Entrega:</strong> {entrega}<br>
    <strong>Forma de pagamento:</strong> {html.escape(forma_pagamento)}
  </div>

  <h2>Itens</h2>
  <table>
    <thead>
      <tr>
        <th>Código</th><th>Descrição</th><th class="num">Qtd.</th>
        <th class="num">Preço Unit.</th><th class="num">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      {linhas_itens}
    </tbody>
  </table>
  <div class="total">TOTAL: {_moeda(venda["valor_total"])}</div>

  {observacoes_html}

  <div class="assinaturas">
    <div>{html.escape(loja["nome"])}<br>(Vendedor)</div>
    <div>{html.escape(venda["cliente_nome"])}<br>(Cliente)</div>
  </div>
</div>
"""
