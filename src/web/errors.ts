// The API's error codes in Portuguese. A code missing here falls back to a generic message.

const SHEET_PROBLEM_TEXT: Record<string, string> = {
  partly_assigned: 'turno com horas sem ninguém',
  names_in_office_hours: 'nomes no horário de expediente',
}

const SHEET_FORMAT_TEXT: Record<string, string> = {
  no_dates: 'não achei a linha de datas',
  dates_not_one_full_month: 'as datas não formam um mês inteiro',
  no_banking_column: 'não achei a coluna "Banking"',
  missing_hours: 'faltam linhas de horário',
}

const shortDate = (date: unknown) => `${String(date).slice(8)}/${String(date).slice(5, 7)}`

export function messageOf(code: string, details: Record<string, unknown>): string {
  switch (code) {
    case 'network_error':
      return 'Sem conexão com o servidor. Tente de novo.'
    case 'missing_token':
    case 'invalid_token':
      return 'Esse token não vale (ou foi trocado). Peça um novo a quem tem a senha do time.'
    case 'invalid_team_password':
      return 'Senha do time errada.'
    case 'team_password_not_configured':
      return 'A senha do time não foi configurada no servidor.'
    case 'invalid_request':
      return 'Algum dado foi enviado errado.'
    case 'month_not_found':
      return 'Esse mês não existe no Coruja.'
    case 'month_exists':
      return 'Esse mês já foi aberto.'
    case 'not_first_month':
      return 'O Coruja já tem meses: a planilha agora serve só para comparar, no Admin.'
    case 'later_month_exists':
      return 'Já existe um mês depois desse.'
    case 'month_started':
      return 'Esse mês já começou: a escala dele não pode mais ser desfeita.'
    case 'month_exported':
      return 'Esse mês já foi exportado: agora a escala só muda por trocas.'
    case 'not_participant':
      return 'Você não participa desse mês.'
    case 'unassigned_days': {
      const dates = (details.dates as string[] | undefined) ?? []
      return `Tem dia sem ninguém (${dates.map(shortDate).join(', ')}). Preencha antes de exportar.`
    }
    case 'invalid_segments':
      return 'Os trechos precisam cobrir o turno inteiro, sem buracos.'
    case 'unknown_dev':
      return 'Esse dev não existe.'
    case 'date_outside_month':
    case 'repeated_date':
      return 'Um dos dias não é desse mês.'
    case 'nickname_taken':
      return 'Já existe um dev com esse apelido.'
    case 'dev_not_found':
      return 'Esse dev não existe.'
    case 'absence_not_found':
      return 'Essa ausência já tinha sido removida.'
    case 'absence_ends_before_it_starts':
      return 'A ausência termina antes de começar.'
    case 'repeated_rule':
      return 'Um dia apareceu duas vezes nas regras.'
    case 'unreadable_sheet':
      return `Não consegui ler a planilha: ${SHEET_FORMAT_TEXT[String(details.reason)] ?? 'formato inesperado'}. Exporte a aba do mês como CSV.`
    case 'sheet_problems': {
      const problems = (details.problems as { date: string; problem: string }[] | undefined) ?? []
      const list = problems.map(
        (item) => `${shortDate(item.date)} (${SHEET_PROBLEM_TEXT[item.problem] ?? item.problem})`,
      )
      return `A planilha tem dias com problema: ${list.join(', ')}. Corrija na planilha e exporte o CSV de novo.`
    }
    case 'unknown_nicknames':
      return `Apelidos da planilha que não são devs: ${((details.nicknames as string[] | undefined) ?? []).join(', ')}. Cadastre antes.`
    default:
      return 'Algo deu errado no servidor. Tente de novo.'
  }
}
