export const knownActions = {
  PERFORM_ORAMA_SEARCH: 'PERFORM_ORAMA_SEARCH',
  ACTION_PLAN: 'ACTION_PLAN',
  ASK_FOLLOWUP: 'ASK_FOLLOWUP',
  GIVE_REPLY: 'GIVE_REPLY',
} as const

export const knownActionsArray = Object.values(knownActions) as string[]
