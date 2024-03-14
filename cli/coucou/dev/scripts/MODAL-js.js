// Modal Contact
function closeModalContact(){
   document.getElementById("contact").style.display = "none";
}

function closeModalSuccess(){
  document.getElementById("contact-success").style.display = "none";
}

function openContact(){
  document.getElementById("contact").style.display = "block";
}

// Modal Mentions Légales
function openMentionsLegales() {
  document.getElementById("mentions-legales").style.display = "block";
}

function closeMentionsLegales() {
  document.getElementById("mentions-legales").style.display = "none";
}

// Modal Données personnelles
function openDonneesPersonnelles() {
  document.getElementById("donnees-personnelles").style.display = "block";
}

function closeDonneesPersonnelles() {
  document.getElementById("donnees-personnelles").style.display = "none";
}

// Modal Commun
window.onclick = function(event) {
  if (event.target == modalContact || event.target == modalContactSuccess || event.target == modalMentionsLegales || event.target == modalDonneesPersonnelles) {
  modalContact.style.display = "none";
  modalContactSuccess.style.display = "none";
  modalMentionsLegales.style.display = "none";
  modalDonneesPersonnelles.style.display = "none";
  }
}