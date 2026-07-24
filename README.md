# 🔐 Electronic Signatures - EEASA SISSOL

## Módulo de Firma Electrónica integrado al sistema SISSOL

Sistema de firma electrónica desarrollado e integrado directamente en la aplicación web empresarial SISSOL (WebLogic + ExtJS 2.x + Oracle), sin modificar ni romper la lógica existente.

---

## 📂 Estructura de Archivos

### Backend (Java / JAX-RS)

| Archivo | Ruta Original en SISSOL | Descripción |
|---|---|---|
| `backend/rest/FirmaEeasaRest.java` | `com.besixplus.sissol.rest` | Controlador REST con endpoints para firmar documentos (temporal y definitivo), obtener adjuntos en Base64 y verificar firmas |
| `backend/firma/FirmaEeasaService.java` | `com.besixplus.sissol.firma` | Servicio de firma electrónica que integra con FirmaEC del gobierno ecuatoriano |
| `backend/firma/VerificacionService.java` | `com.besixplus.sissol.firma` | Servicio de verificación criptográfica de firmas digitales (extrae certificados, valida integridad) |

### Frontend (JavaScript / ExtJS 2.x)

| Archivo | Ruta Original en SISSOL | Descripción |
|---|---|---|
| `frontend/frmFirma.js` | `src/js/` | Modal reutilizable con 3 pestañas: Firmar Documento, Verificar Documento y Validar Certificado. Incluye visor PDF con estampado visual, selectores con búsqueda/filtrado y soporte temporal/definitivo |

---

## 🔧 Funcionalidades

- **Firma de documentos PDF** con certificado digital (.p12)
- **Estampado visual** de firma en posición seleccionada por el usuario sobre el PDF
- **Verificación de firmas** existentes en documentos PDF
- **Validación de certificados** digitales (.p12)
- **Soporte temporal y definitivo** — firma documentos en trámites nuevos (temporales) y en memos ya existentes (definitivos)
- **Selectores con búsqueda** — filtrado de documentos por nombre
- **Integración con FirmaEC** — sistema oficial del gobierno ecuatoriano

---

## 🏗️ Tecnologías

- **Backend**: Java, JAX-RS (REST), Oracle DB, WebLogic
- **Frontend**: ExtJS 2.x, JavaScript, PDF.js
- **Firma**: FirmaEC (BCE Ecuador), PKCS#12, X.509
- **Base de datos**: Oracle (tablas `EEASA_TRA_ADJUNTO` y `EEASA_TRA_ADJUNTO_TMP`)

---

## 📌 Principio de Desarrollo

> Todos los archivos son **100% nuevos** — no se reemplazó ni se modificó ningún archivo existente del sistema SISSOL.
> La integración se logró únicamente mediante **extensión**: nuevos endpoints REST, nuevos servicios y un nuevo modal JavaScript.
