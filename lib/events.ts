import { EventEmitter } from "events";

/**
 * Bus d'événements en mémoire pour la mise à jour temps réel du dashboard
 * admin (§4.2 du cahier des charges) via Server-Sent Events.
 *
 * Limite assumée : fonctionne pour une seule instance de serveur Node
 * (ex. un déploiement Vercel avec runtime "nodejs" en une seule région, ou
 * un serveur classique). Pour une mise à l'échelle multi-instance, remplacer
 * par un pub/sub partagé (Redis, Postgres LISTEN/NOTIFY...).
 */
declare global {
  // eslint-disable-next-line no-var
  var belgraviaEvents: EventEmitter | undefined;
}

export const visiteEvents = global.belgraviaEvents || new EventEmitter();
visiteEvents.setMaxListeners(100);
if (process.env.NODE_ENV !== "production") global.belgraviaEvents = visiteEvents;

export const NOUVELLE_VISITE = "nouvelle-visite";
