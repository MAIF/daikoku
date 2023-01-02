// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add("login", (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })

// import 'cypress-waitfor';

//@ts-ignore
Cypress.Commands.add('login', (username: string, password: string) => {
  cy.session([username, password], () => {
    cy.clearAllCookies()
    cy.visit('http://localhost:9000/auth/Local/login')
      .get('input[name=username]').type(username)
      .get('input[name=password]').type(password)
      .get('button').click()
      .url().should('include', '/apis')
  })
})



