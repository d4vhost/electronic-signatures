package com.besixplus.sissol.rest;

import com.besixplus.sissol.firma.FirmaEeasaService;
import com.besixplus.sissol.firma.VerificacionService;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

import javax.ws.rs.Consumes;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import javax.ws.rs.core.StreamingOutput;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.lang.reflect.Type;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;
import java.util.Base64;
import javax.ejb.Stateless;

@Stateless
@Path("/firma")
public class FirmaEeasaRest {

    private static final Logger LOGGER = Logger.getLogger(FirmaEeasaRest.class.getName());
    private final FirmaEeasaService firmaECService;
    private final VerificacionService verificacionService;
    private final Gson gson;

    
    private String getEtpaIdPorUsuario(java.sql.Connection conn, String usuario) throws Exception {
        String etpaId = null;
        java.sql.PreparedStatement ps = null;
        java.sql.ResultSet rs = null;
        try {
            ps = conn.prepareStatement("SELECT ETPA_ID FROM EEASA_TRA_PARTICIPANTE WHERE ETPA_USUARIO = ?");
            ps.setString(1, usuario);
            rs = ps.executeQuery();
            if (rs.next()) {
                etpaId = rs.getString("ETPA_ID");
            }
        } finally {
            if (rs != null) rs.close();
            if (ps != null) ps.close();
        }
        return etpaId;
    }

    public FirmaEeasaRest() {
        this.firmaECService = new FirmaEeasaService();
        this.verificacionService = new VerificacionService();
        this.gson = new Gson();
    }

    @POST
    @Path("/firmar")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response firmarDocumentoDirecto(java.io.InputStream is) {
        LOGGER.info("Petición recibida en /rs/firma/firmar");
        
        String pdfBase64 = null;
        String p12Base64 = null;
        String password = null;
        int pagina = 0;
        float posX = 0f;
        float posY = 0f;
        
        // Parametros opcionales para guardar adjunto automaticamente
        Long idTarea = null;
        String usuario = null;
        String nombreDocumento = null;

        try {
            com.google.gson.stream.JsonReader reader = new com.google.gson.stream.JsonReader(new java.io.InputStreamReader(is, "UTF-8"));
            reader.beginObject();
            while (reader.hasNext()) {
                String name = reader.nextName();
                if (name.equals("pdfBase64")) pdfBase64 = reader.nextString();
                else if (name.equals("p12Base64")) p12Base64 = reader.nextString();
                else if (name.equals("password")) password = reader.nextString();
                else if (name.equals("pagina")) pagina = reader.nextInt();
                else if (name.equals("posX")) posX = (float) reader.nextDouble();
                else if (name.equals("posY")) posY = (float) reader.nextDouble();
                else if (name.equals("idTarea")) idTarea = reader.nextLong();
                else if (name.equals("usuario")) usuario = reader.nextString();
                else if (name.equals("nombreDocumento")) nombreDocumento = reader.nextString();
                else reader.skipValue();
            }
            reader.endObject();
            reader.close();
        } catch (Exception ex) {
            LOGGER.severe("Error parseando JSON de entrada: " + ex.getMessage());
            return Response.status(Response.Status.BAD_REQUEST).entity("{\"error\": \"Error procesando parametros\"}").build();
        }

        if (pdfBase64 == null || p12Base64 == null || password == null) {
            LOGGER.warning("Faltan parámetros requeridos para la firma.");
            return Response.status(Response.Status.BAD_REQUEST).entity("{\"error\": \"Faltan parametros requeridos\"}").build();
        }

        try {
            String pdfFirmado = firmaECService.firmarDocumento(
                    pdfBase64, 
                    p12Base64, 
                    password,
                    pagina,
                    posX,
                    posY
            );

            // Guardar automaticamente en la base de datos como adjunto si se enviaron los parametros
            if (idTarea != null && usuario != null && nombreDocumento != null) {
                try {
                    byte[] signedBytes = Base64.getDecoder().decode(pdfFirmado);
                    com.besixplus.api.ServicioTarea servicioTarea = new com.besixplus.api.ServicioTarea();
                    servicioTarea.addAttachments(
                        usuario,         // inUser
                        0L,              // inETAD_ID (0 = auto)
                        idTarea,         // inETMT_ID (id de la tarea/movimiento)
                        0,               // inETAD_SECUENCIA
                        nombreDocumento, // inETAD_NOMBRE
                        signedBytes,     // inETAD_CONTENIDO
                        "application/pdf", // inETAD_CODIFICACION
                        usuario,         // inETAD_ACTUALIZADO_POR
                        null             // inETAD_FECHA_REGISTRO
                    );
                    LOGGER.info("Documento firmado guardado exitosamente como adjunto en la tarea: " + idTarea);
                } catch(Exception e) {
                    LOGGER.severe("No se pudo guardar el adjunto en BD: " + e.getMessage());
                    // Continuamos para no afectar la descarga aunque falle el guardado
                }
            }

            final String pdfFirmadoFinal = pdfFirmado;
            StreamingOutput stream = new StreamingOutput() {
                @Override
                public void write(OutputStream os) throws IOException {
                    Writer writer = new OutputStreamWriter(os, "UTF-8");
                    writer.write("{\"pdfFirmado\":\"");
                    writer.write(pdfFirmadoFinal);
                    writer.write("\"}");
                    writer.flush();
                }
            };
            return Response.ok(stream, MediaType.APPLICATION_JSON).build();
        } catch (Exception e) {
            LOGGER.severe("Error procesando la firma electrónica: " + e.getMessage());
            Map<String, String> errResp = new HashMap<>();
            errResp.put("error", "Error procesando la firma electrónica: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).entity(gson.toJson(errResp)).build();
        }
    }

    @POST
    @Path("/verificar")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response verificarDocumento(java.io.InputStream is) {
        LOGGER.info("Petición recibida en /rs/firma/verificar");

        String pdfBase64 = null;
        try {
            com.google.gson.stream.JsonReader reader = new com.google.gson.stream.JsonReader(new java.io.InputStreamReader(is, "UTF-8"));
            reader.beginObject();
            while (reader.hasNext()) {
                String name = reader.nextName();
                if (name.equals("pdfBase64")) pdfBase64 = reader.nextString();
                else reader.skipValue();
            }
            reader.endObject();
            reader.close();
        } catch (Exception ex) {
            LOGGER.severe("Error parseando JSON de verificacion: " + ex.getMessage());
            return Response.status(Response.Status.BAD_REQUEST).entity("{\"error\": \"Error procesando parametros\"}").build();
        }

        if (pdfBase64 == null || pdfBase64.isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST).entity("{\"error\": \"Falta pdfBase64\"}").build();
        }

        try {
            List<Map<String, Object>> firmantes = verificacionService.verificarDocumento(pdfBase64);

            Map<String, Object> response = new HashMap<>();
            response.put("totalFirmantes", firmantes.size());
            response.put("firmantes", firmantes);
            response.put("tieneFirma", !firmantes.isEmpty());

            return Response.ok(gson.toJson(response)).build();
        } catch (Exception e) {
            LOGGER.severe("Error verificando documento: " + e.getMessage());
            Map<String, Object> errorResp = new HashMap<>();
            errorResp.put("error", "Error al verificar el documento.");
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).entity(gson.toJson(errorResp)).build();
        }
    }

    @POST
    @Path("/validar-certificado")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response validarCertificado(String jsonBody) {
        LOGGER.info("Petición recibida en /rs/firma/validar-certificado");

        Type type = new TypeToken<Map<String, String>>(){}.getType();
        Map<String, String> request = gson.fromJson(jsonBody, type);

        String p12Base64 = request.get("p12Base64");
        String password = request.get("password");

        if (p12Base64 == null || p12Base64.isEmpty() || password == null) {
            return Response.status(Response.Status.BAD_REQUEST).entity("{\"valido\": false, \"message\": \"Faltan parametros\"}").build();
        }

        try {
            byte[] p12Bytes = Base64.getDecoder().decode(p12Base64);
            if (p12Bytes.length > 50 * 1024) {
                Map<String, Object> errorResp = new HashMap<>();
                errorResp.put("valido", false);
                errorResp.put("message", "El archivo del certificado es demasiado grande.");
                return Response.status(Response.Status.BAD_REQUEST).entity(gson.toJson(errorResp)).build();
            }
            Map<String, Object> response = verificacionService.validarCertificadoP12(p12Bytes, password);
            
            // Generar QR preview unico basado en datos del certificado
            String subjectDN = (String) response.get("subjectDN");
            String qrContent = "Certificado: " + subjectDN + "\nhttps://www.firmadigital.gob.ec/";
            String qrPreview = FirmaEeasaService.generateQRBase64(qrContent, 200);
            response.put("qrPreview", qrPreview);
            
            return Response.ok(gson.toJson(response)).build();
        } catch (Exception e) {
            LOGGER.warning("Error validando certificado: " + e.getMessage());
            Map<String, Object> errorResp = new HashMap<>();
            errorResp.put("valido", false);
            errorResp.put("message", "Certificado inválido o contraseña incorrecta.");
            return Response.ok(gson.toJson(errorResp)).build();
        }
    }

    @POST
    @Path("/adjunto-base64")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response obtenerAdjuntoBase64(String jsonBody) {
        LOGGER.info("Petición recibida en /rs/firma/adjunto-base64");

        Type type = new TypeToken<Map<String, String>>(){}.getType();
        Map<String, String> request = gson.fromJson(jsonBody, type);

        String idAdjuntoStr = request.get("idAdjunto");
        if (idAdjuntoStr == null || idAdjuntoStr.isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST).entity("{\"error\": \"Falta idAdjunto\"}").build();
        }

        try {
            Long idAdjunto = Long.valueOf(idAdjuntoStr);
            com.besixplus.api.ServicioTarea objAttachment = new com.besixplus.api.ServicioTarea();
            byte[] contenidoAdjunto = objAttachment.getAttachmentBytes(idAdjunto);
            
            if (contenidoAdjunto == null || contenidoAdjunto.length == 0) {
                return Response.status(Response.Status.NOT_FOUND).entity("{\"error\": \"No se encontró el adjunto\"}").build();
            }
            
            final byte[] contenidoFinal = contenidoAdjunto;
            StreamingOutput stream = new StreamingOutput() {
                @Override
                public void write(OutputStream os) throws IOException {
                    Writer writer = new OutputStreamWriter(os, "UTF-8");
                    writer.write("{\"pdfBase64\":\"");
                    writer.write(Base64.getEncoder().encodeToString(contenidoFinal));
                    writer.write("\"}");
                    writer.flush();
                }
            };
            return Response.ok(stream, MediaType.APPLICATION_JSON).build();
        } catch (Exception e) {
            LOGGER.severe("Error obteniendo adjunto: " + e.getMessage());
            Map<String, Object> errorResp = new HashMap<>();
            errorResp.put("error", "Error al obtener el documento adjunto.");
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).entity(gson.toJson(errorResp)).build();
        }
    }
    @POST
    @Path("/adjunto-temporal-base64")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response obtenerAdjuntoTemporalBase64(String jsonBody) {
        LOGGER.info("Petición recibida en /rs/firma/adjunto-temporal-base64");

        Type type = new TypeToken<Map<String, String>>(){}.getType();
        Map<String, String> request = gson.fromJson(jsonBody, type);

        String idAdjuntoStr = request.get("idAdjunto");
        if (idAdjuntoStr == null || idAdjuntoStr.isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST).entity("{\"error\": \"Falta idAdjunto temporal\"}").build();
        }

        java.sql.Connection conn = null;
        java.sql.PreparedStatement ps = null;
        java.sql.ResultSet rs = null;
        try {
            Long idAdjunto = Long.valueOf(idAdjuntoStr);
            conn = new com.besixplus.ManagerConnectionSissol().getConnection();
            String sql = "SELECT ETAT_ARCHIVO FROM EEASA_TRA_ADJUNTO_TMP WHERE ETAT_ID = ?";
            ps = conn.prepareStatement(sql);
            ps.setLong(1, idAdjunto);
            rs = ps.executeQuery();
            
            byte[] contenidoAdjunto = null;
            if (rs.next()) {
                contenidoAdjunto = rs.getBytes("ETAT_ARCHIVO");
            }
            
            if (contenidoAdjunto == null || contenidoAdjunto.length == 0) {
                return Response.status(Response.Status.NOT_FOUND).entity("{\"error\": \"No se encontró el adjunto temporal\"}").build();
            }
            
            final byte[] contenidoFinal = contenidoAdjunto;
            StreamingOutput stream = new StreamingOutput() {
                @Override
                public void write(OutputStream os) throws IOException {
                    Writer writer = new OutputStreamWriter(os, "UTF-8");
                    writer.write("{\"pdfBase64\":\"");
                    writer.write(Base64.getEncoder().encodeToString(contenidoFinal));
                    writer.write("\"}");
                    writer.flush();
                }
            };
            return Response.ok(stream, MediaType.APPLICATION_JSON).build();
        } catch (Exception e) {
            LOGGER.severe("Error obteniendo adjunto temporal: " + e.getMessage());
            Map<String, Object> errorResp = new HashMap<>();
            errorResp.put("error", "Error al obtener el documento adjunto temporal.");
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).entity(gson.toJson(errorResp)).build();
        } finally {
            try { if (rs != null) rs.close(); } catch (Exception ignored) {}
            try { if (ps != null) ps.close(); } catch (Exception ignored) {}
            try { if (conn != null) conn.close(); } catch (Exception ignored) {}
        }
    }

    @POST
    @Path("/firmar-temporal")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response firmarDocumentoTemporal(java.io.InputStream is) {
        LOGGER.info("Petición recibida en /rs/firma/firmar-temporal");
        
        String pdfBase64 = null;
        String p12Base64 = null;
        String password = null;
        int pagina = 0;
        float posX = 0f;
        float posY = 0f;
        Long idAdjunto = null;

        String usuario = null;
        String nombreDocumento = null;

        try {
            com.google.gson.stream.JsonReader reader = new com.google.gson.stream.JsonReader(new java.io.InputStreamReader(is, "UTF-8"));
            reader.beginObject();
            while (reader.hasNext()) {
                String name = reader.nextName();
                if (name.equals("pdfBase64")) pdfBase64 = reader.nextString();
                else if (name.equals("p12Base64")) p12Base64 = reader.nextString();
                else if (name.equals("password")) password = reader.nextString();
                else if (name.equals("pagina")) pagina = reader.nextInt();
                else if (name.equals("posX")) posX = (float) reader.nextDouble();
                else if (name.equals("posY")) posY = (float) reader.nextDouble();
                else if (name.equals("idAdjunto")) idAdjunto = reader.nextLong();
                else if (name.equals("usuario")) usuario = reader.nextString();
                else if (name.equals("nombreDocumento")) nombreDocumento = reader.nextString();
                else reader.skipValue();
            }
            reader.endObject();
            reader.close();
        } catch (Exception ex) {
            LOGGER.severe("Error parseando JSON de entrada en firmar-temporal: " + ex.getMessage());
            return Response.status(Response.Status.BAD_REQUEST).entity("{\"error\": \"Error procesando parametros\"}").build();
        }

        if (pdfBase64 == null || p12Base64 == null || password == null ) {
            LOGGER.warning("Faltan parámetros requeridos para la firma temporal.");
            return Response.status(Response.Status.BAD_REQUEST).entity("{\"error\": \"Faltan parametros requeridos\"}").build();
        }

        try {
            String pdfFirmado = firmaECService.firmarDocumento(
                    pdfBase64, 
                    p12Base64, 
                    password,
                    pagina,
                    posX,
                    posY
            );

                        byte[] signedBytes = Base64.getDecoder().decode(pdfFirmado);
            java.sql.Connection conn = null;
            java.sql.PreparedStatement ps = null;
              Long returnedId = idAdjunto;
            try {
                conn = new com.besixplus.ManagerConnectionSissol().getConnection();
                if (idAdjunto != null) {
                    // Sobrescribir el adjunto en la tabla temporal
                    String sql = "UPDATE EEASA_TRA_ADJUNTO_TMP SET ETAT_ARCHIVO = ? WHERE ETAT_ID = ?";
                    ps = conn.prepareStatement(sql);
                    ps.setBytes(1, signedBytes);
                    ps.setLong(2, idAdjunto);
                    int rowsUpdated = ps.executeUpdate();
                    if (rowsUpdated > 0) {
                        LOGGER.info("Documento temporal firmado y sobrescrito exitosamente, ID: " + idAdjunto);
                    } else {
                        LOGGER.warning("No se encontro el adjunto temporal para sobrescribir, ID: " + idAdjunto);
                    }
                } else if (usuario != null && nombreDocumento != null) {
                    // Insertar nuevo adjunto temporal
                    String etpaId = getEtpaIdPorUsuario(conn, usuario);
                    if (etpaId != null) {
                        com.besixplus.db.Eeasa_tra_adjunto_tmp adjuntoTemporal = new com.besixplus.db.Eeasa_tra_adjunto_tmp();
                        adjuntoTemporal.setETAT_ID(0L);
                        adjuntoTemporal.setETAT_NOMBRE(nombreDocumento);
                        adjuntoTemporal.setETPA_ID(etpaId);
                        adjuntoTemporal.setETAT_ARCHIVO(signedBytes);
                        adjuntoTemporal.setETAT_FECHA_REGISTRO(new java.sql.Timestamp(new java.util.Date().getTime()));
                        
                        Long newId = adjuntoTemporal.Insertar(conn);
                        returnedId = newId;
                          LOGGER.info("Nuevo documento temporal insertado con ID: " + newId);
                    }
                }
            } catch (Exception e) {
                LOGGER.severe("Error sobrescribiendo adjunto temporal en BD: " + e.getMessage());
                // Throw to return 500
                throw e;
            } finally {
                try { if (ps != null) ps.close(); } catch (Exception ignored) {}
                try { if (conn != null) conn.close(); } catch (Exception ignored) {}
            }

            final String pdfFirmadoFinal = pdfFirmado;
            final Long finalReturnedId = returnedId;
            StreamingOutput stream = new StreamingOutput() {
                @Override
                public void write(OutputStream os) throws IOException {
                    Writer writer = new OutputStreamWriter(os, "UTF-8");
                    writer.write("{\"pdfFirmado\":\"");
                    writer.write(pdfFirmadoFinal);
                    writer.write("\",\"idAdjunto\":");
                    writer.write(finalReturnedId != null ? String.valueOf(finalReturnedId) : "null");
                    writer.write(",\"exito\":true}");
                    writer.flush();
                }
            };
            return Response.ok(stream, MediaType.APPLICATION_JSON).build();
        } catch (Exception e) {
            LOGGER.severe("Error procesando la firma electrónica temporal: " + e.getMessage());
            Map<String, String> errResp = new HashMap<>();
            errResp.put("error", "Error procesando la firma electrónica: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).entity(gson.toJson(errResp)).build();
        }
    }
}

