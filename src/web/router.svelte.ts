// Hash routes (decisions #27): the app is one page, so links work without server routes.
//   #/entrar · #/mes · #/mes/2026-12 · #/perfil · #/admin · #/admin/dev/3

export type Route =
  | { name: 'sign-in' }
  | { name: 'month'; month: string | null }
  | { name: 'profile' }
  | { name: 'admin' }
  | { name: 'admin-dev'; devId: number }

const MONTH_ROUTE = /^#\/mes(?:\/(\d{4}-(?:0[1-9]|1[0-2])))?$/
const ADMIN_DEV_ROUTE = /^#\/admin\/dev\/(\d+)$/

function parse(hash: string): Route {
  if (hash === '#/entrar') return { name: 'sign-in' }
  if (hash === '#/perfil') return { name: 'profile' }
  if (hash === '#/admin') return { name: 'admin' }
  const adminDev = ADMIN_DEV_ROUTE.exec(hash)
  if (adminDev) return { name: 'admin-dev', devId: Number(adminDev[1]) }
  const month = MONTH_ROUTE.exec(hash)
  return { name: 'month', month: month?.[1] ?? null }
}

export const router = $state({ route: parse(location.hash) })
addEventListener('hashchange', () => {
  router.route = parse(location.hash)
})

export const links = {
  signIn: '#/entrar',
  month: (month?: string) => (month ? `#/mes/${month}` : '#/mes'),
  profile: '#/perfil',
  admin: '#/admin',
  adminDev: (devId: number) => `#/admin/dev/${devId}`,
}
