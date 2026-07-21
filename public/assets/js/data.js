/* LOCALLAYERS — Article catalog
   Globally exposes window.ARTICLES so every page (home, list, article, admin)
   can read the same source of truth. Eventually replaced by Firestore queries.
   Schema: id => { type?, series?, free?, title, sub, cat, date, thumb, tags[], duration? }
*/
window.ARTICLES = {};
