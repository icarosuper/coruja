import { saoPauloDate } from '../schedule/calendar'

/** Today in São Paulo, the team's calendar, whatever the device's time zone. */
export const today = () => saoPauloDate(new Date())
