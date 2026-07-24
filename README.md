# 🔐 Electronic Signatures Module

## Módulo de Firma Electrónica para Aplicaciones Web Empresariales

Sistema de firma electrónica integrable en aplicaciones web empresariales Java. Desarrollado como módulo independiente que se acopla sin modificar la lógica existente del sistema anfitrión.

---

## 📂 Estructura de Archivos

### Backend (Java / JAX-RS)

| Archivo | Descripción |
|---|---|
| `backend/rest/FirmaEeasaRest.java` | Controlador REST con endpoints para firmar documentos (temporal y definitivo), obtener adjuntos en Base64 y verificar firmas |
| `backend/firma/FirmaEeasaService.java` | Servicio de firma electrónica que integra con proveedores de firma digital |
| `backend/firma/VerificacionService.java` | Servicio de verificación criptográfica de firmas digitales (extrae certificados, valida integridad) |

### Frontend (JavaScript / ExtJS)

| Archivo | Descripción |
|---|---|
| `frontend/frmFirma.js` | Modal reutilizable con 3 pestañas: Firmar Documento, Verificar Documento y Validar Certificado. Incluye visor PDF con estampado visual, selectores con búsqueda/filtrado y soporte temporal/definitivo |

---

## 🔧 Funcionalidades

- **Firma de documentos PDF** con certificado digital (.p12)
- **Estampado visual** de firma en posición seleccionada por el usuario sobre el PDF
- **Verificación de firmas** existentes en documentos PDF
- **Validación de certificados** digitales (.p12)
- **Soporte temporal y definitivo** — firma documentos en trámites nuevos (temporales) y en registros ya existentes (definitivos)
- **Selectores con búsqueda** — filtrado de documentos por nombre
- **Integración con proveedores de firma** — compatible con sistemas de firma electrónica gubernamentales

---

## 🏗️ Tecnologías

- **Backend**: Java, JAX-RS (REST), Oracle DB, Servidor de aplicaciones Java EE
- **Frontend**: ExtJS, JavaScript, PDF.js
- **Firma**: PKCS#12, X.509, certificados digitales
- **Almacenamiento**: Base de datos relacional con tablas de adjuntos temporales y definitivos

---

## 🚀 Cómo Usar

1. **Backend**: Copiar los archivos Java en la estructura de paquetes de tu proyecto. Configurar las rutas REST según tu aplicación.
2. **Frontend**: Incluir `frmFirma.js` en tu aplicación web. Instanciar el modal pasando los parámetros de configuración:
   - `codigoTarea` — para firmar en registros definitivos
   - `isTemporal: true` — para firmar en registros temporales
   - `listaAdjuntos` — lista de documentos disponibles para firmar
3. **Base de datos**: Crear las tablas de adjuntos temporales y definitivos con campos para ID, archivo (BLOB), nombre, fecha y usuario.

---

## 📌 Principio de Desarrollo

> Todos los archivos son **100% nuevos** — diseñados para integrarse en sistemas existentes sin reemplazar ni modificar archivos previos.
> La integración se logra únicamente mediante **extensión**: nuevos endpoints REST, nuevos servicios y un nuevo modal JavaScript reutilizable.
