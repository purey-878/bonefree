const rawPrototypeNoticeFlag = import.meta.env.VITE_ENABLE_PROTOTYPE_NOTICES as string | undefined

export const showPrototypeNotices = rawPrototypeNoticeFlag == null
  ? true
  : !["false", "0", "off", "no"].includes(rawPrototypeNoticeFlag.trim().toLowerCase())
