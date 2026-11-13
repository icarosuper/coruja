import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'

const rootElement = document.getElementById('app')
if (!rootElement) throw new Error('#app not found in index.html')

mount(App, { target: rootElement })
