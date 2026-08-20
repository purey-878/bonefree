import type { EventsSettings } from "../types/siteSettings"

export const defaultEventsSettings: EventsSettings = {
  events: [
    {
      id: "dj-adriano",
      title: "DJ Adriano",
      kicker: "Seleção de sexta",
      description: "Um set quente noite dentro, feito para cocktails, pratos vegetais e uma sala sempre em movimento.",
      date: "2026-06-12",
      startTime: "19:00",
      endTime: "23:00",
      imageUrl: "/assets/images/dj_adriano.jpg",
      enabled: true,
    },
    {
      id: "dj-khalil",
      title: "DJ Khalil",
      kicker: "Sessão de sábado",
      description: "Sons guiados pelo groove para uma noite longa à mesa com amigos, pratos para partilhar e energia costeira.",
      date: "2026-06-13",
      startTime: "20:00",
      endTime: "00:00",
      imageUrl: "/assets/images/dj_khalil.jpg",
      enabled: true,
    },
  ],
}
