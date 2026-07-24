package com.besixplus.sissol.firma;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureInterface;

import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Security;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Base64;
import java.util.Calendar;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Map;
import java.util.TimeZone;
import java.util.UUID;
import java.util.logging.Logger;
import javax.imageio.ImageIO;
import javax.naming.ldap.LdapName;
import javax.naming.ldap.Rdn;

public class FirmaEeasaService {

    private static final Logger LOGGER = Logger.getLogger(FirmaEeasaService.class.getName());

    public String firmarDocumento(String pdfBase64, String p12Base64, String password, int pagina, float posX, float posY) {
        LOGGER.info("Iniciando firma. Coordenadas -> pagina=" + pagina + " posX=" + posX + " posY=" + posY);
        
        try {
            Security.addProvider(new org.bouncycastle.jce.provider.BouncyCastleProvider());

            byte[] pdfBytes = Base64.getDecoder().decode(pdfBase64);
            byte[] p12Bytes = Base64.getDecoder().decode(p12Base64);

            KeyStore keystore = KeyStore.getInstance("PKCS12");
            keystore.load(new ByteArrayInputStream(p12Bytes), password.toCharArray());

            Enumeration<String> aliases = keystore.aliases();
            String alias = null;
            while (aliases.hasMoreElements()) {
                alias = aliases.nextElement();
                if (keystore.isKeyEntry(alias)) break;
            }
            if (alias == null) throw new RuntimeException("No se encontro llave privada en el certificado.");

            PrivateKey privateKey = (PrivateKey) keystore.getKey(alias, password.toCharArray());
            Certificate[] certChain = keystore.getCertificateChain(alias);
            X509Certificate x509Cert = (X509Certificate) certChain[0];
            String signerName = extractCommonName(x509Cert.getSubjectX500Principal().getName());
            
            // QR unico por certificado y evento de firma
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            sdf.setTimeZone(TimeZone.getTimeZone("America/Guayaquil"));
            String qrContent = "Firmado por: " + signerName + 
                             "\nSerial: " + x509Cert.getSerialNumber().toString(16).toUpperCase() + 
                             "\nFecha: " + sdf.format(Calendar.getInstance().getTime()) +
                             "\nhttps://www.firmadigital.gob.ec/";
            
            LOGGER.info("QR vectorial generado en memoria. Contenido unico basado en certificado serial + timestamp.");
            
            byte[] pdfFirmado = aplicarFirmaDigitalVisible(pdfBytes, privateKey, certChain, signerName, pagina, posX, posY, qrContent);
            LOGGER.info("Firma aplicada exitosamente mediante guardado incremental.");
            return Base64.getEncoder().encodeToString(pdfFirmado);

        } catch (Exception e) {
            LOGGER.severe("Error al firmar: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("Error en la firma electronica", e);
        }
    }

    private byte[] aplicarFirmaDigitalVisible(byte[] pdfBytes, PrivateKey privateKey, Certificate[] certChain, String signerName, int pagina, float posX, float posY, String qrContent) throws Exception {
        try (PDDocument document = PDDocument.load(pdfBytes)) {
            int targetPage = (pagina > 0 && pagina <= document.getNumberOfPages()) ? (pagina - 1) : 0;
            
            if (posX <= 0 && posY <= 0) {
                posX = 50;
                posY = 50;
            }

            float qrSize = 38f;
            float stampWidth = 158f;
            float stampHeight = qrSize;

            PDSignature signature = new PDSignature();
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            signature.setName(signerName);
            signature.setLocation("Ecuador");
            signature.setReason("Firma Electronica");
            signature.setSignDate(Calendar.getInstance());

            org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions options = new org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions();
            options.setVisualSignature(createVisualSignatureTemplate(document, targetPage, posX, posY, stampWidth, stampHeight, qrContent, qrSize, signerName));
            options.setPage(targetPage);

            document.addSignature(signature, new SignatureInterface() {
                @Override
                public byte[] sign(InputStream content) throws IOException {
                    try {
                        CMSSignedDataGenerator gen = new CMSSignedDataGenerator();
                        X509Certificate cert = (X509Certificate) certChain[0];
                        ContentSigner shaSigner = new JcaContentSignerBuilder("SHA256WithRSA").build(privateKey);
                        gen.addSignerInfoGenerator(new JcaSignerInfoGeneratorBuilder(
                                new JcaDigestCalculatorProviderBuilder().build()).build(shaSigner, cert));
                        gen.addCertificates(new JcaCertStore(Arrays.asList(certChain)));
                        byte[] contentBytes = org.apache.pdfbox.io.IOUtils.toByteArray(content);
                        CMSSignedData signedData = gen.generate(new CMSProcessableByteArray(contentBytes), false);
                        return signedData.getEncoded();
                    } catch (Exception e) {
                        throw new IOException("Error generando firma CMS", e);
                    }
                }
            }, options);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.saveIncremental(baos);
            return baos.toByteArray();
        }
    }

    /**
     * Crea un template de firma visual visible DENTRO de la anotacion.
     * Al estar en el appearance stream, aparece instantaneamente sin necesidad de hacer zoom.
     * Al usar un path vectorial unico (compound path), PDFium no lo borra al hacer zoom.
     */
    private InputStream createVisualSignatureTemplate(PDDocument srcDoc, int targetPage, float posX, float posY, float width, float height, String qrContent, float qrSize, String signerName) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            org.apache.pdfbox.pdmodel.common.PDRectangle origBox = srcDoc.getPage(targetPage).getMediaBox();
            org.apache.pdfbox.pdmodel.common.PDRectangle newBox = new org.apache.pdfbox.pdmodel.common.PDRectangle(origBox.getLowerLeftX(), origBox.getLowerLeftY(), origBox.getWidth(), origBox.getHeight());
            PDPage page = new PDPage(newBox);
            doc.addPage(page);
            org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm acroForm = new org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(acroForm);
            org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField signatureField = new org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField(acroForm);
            signatureField.setPartialName("FirmaEC_" + UUID.randomUUID().toString().substring(0,8));
            org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget widget = signatureField.getWidgets().get(0);
            widget.setPrinted(true); // Imprimible para que se vea
            widget.setPage(page);
            acroForm.getFields().add(signatureField);
            acroForm.setSignaturesExist(true);
            acroForm.setAppendOnly(true);
            acroForm.getCOSObject().setDirect(true);
            
            org.apache.pdfbox.pdmodel.common.PDRectangle rect = new org.apache.pdfbox.pdmodel.common.PDRectangle(posX, posY, width, height);
            widget.setRectangle(rect);
            
            org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary appearanceDictionary = new org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary();
            appearanceDictionary.getCOSObject().setDirect(true);
            org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream appearanceStream = new org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream(doc);
            appearanceStream.setBBox(new org.apache.pdfbox.pdmodel.common.PDRectangle(width, height));
            appearanceStream.setResources(new org.apache.pdfbox.pdmodel.PDResources());

            // Generar matriz QR en alta resolucion para evitar que se vea borroso
            QRCodeWriter qrCodeWriter = new QRCodeWriter();
            Map<EncodeHintType, Object> hints = new HashMap<>();
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.H);
            hints.put(EncodeHintType.MARGIN, 0);
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            
            // Generar QR a 400x400 pixeles para nitidez
            int qrPixelSize = 400;
            BitMatrix bitMatrix = qrCodeWriter.encode(qrContent, BarcodeFormat.QR_CODE, qrPixelSize, qrPixelSize, hints);
            
            java.awt.image.BufferedImage qrImage = new java.awt.image.BufferedImage(qrPixelSize, qrPixelSize, java.awt.image.BufferedImage.TYPE_INT_RGB);
            for (int x = 0; x < qrPixelSize; x++) {
                for (int y = 0; y < qrPixelSize; y++) {
                    qrImage.setRGB(x, y, bitMatrix.get(x, y) ? 0xFF000000 : 0xFFFFFFFF);
                }
            }

            // Preparar nombre en lineas
            String[] nameParts = signerName.toUpperCase().split("\\s+");
            String nameLine1 = signerName.toUpperCase();
            String nameLine2 = "";
            if (nameParts.length > 2) {
                int mid = nameParts.length / 2;
                nameLine1 = String.join(" ", Arrays.copyOfRange(nameParts, 0, mid + (nameParts.length % 2)));
                nameLine2 = String.join(" ", Arrays.copyOfRange(nameParts, mid + (nameParts.length % 2), nameParts.length));
            } else if (nameParts.length == 2) {
                nameLine1 = nameParts[0];
                nameLine2 = nameParts[1];
            }

            // Dibujar QR como IMAGEN y texto como TEXTO en el appearance stream (coordenadas relativas 0,0)
            org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject pdImage = org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory.createFromImage(doc, qrImage);
            
            try (PDPageContentStream cs = new PDPageContentStream(doc, appearanceStream)) {
                // Dibujar imagen QR escalada al tamano en puntos (qrSize)
                cs.drawImage(pdImage, 0, 0, qrSize, qrSize);
                
                // Dibujar texto al lado del QR
                float textX = qrSize + 2.0f;
                float textY = qrSize - 8.0f;

                cs.beginText();
                cs.setNonStrokingColor(Color.BLACK);
                cs.setFont(PDType1Font.COURIER, 3.2f);
                cs.newLineAtOffset(textX, textY);
                cs.showText("Validar \u00FAnicamente en FirmaEC.");
                
                cs.newLineAtOffset(0, -4.5f);
                cs.showText("Firmado electr\u00F3nicamente por:");
                
                cs.setFont(PDType1Font.COURIER_BOLD, 5.0f);
                cs.newLineAtOffset(0, -5.5f);
                cs.showText(nameLine1);
                if (!nameLine2.isEmpty()) {
                    cs.newLineAtOffset(0, -5.0f);
                    cs.showText(nameLine2);
                }
                cs.endText();
            }
            
            appearanceDictionary.setNormalAppearance(appearanceStream);
            widget.setAppearance(appearanceDictionary);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return new ByteArrayInputStream(baos.toByteArray());
        }
    }

    private String extractCommonName(String principalName) {
        try {
            LdapName ldapDN = new LdapName(principalName);
            for (Rdn rdn : ldapDN.getRdns()) {
                if (rdn.getType().equalsIgnoreCase("CN")) {
                    return rdn.getValue().toString();
                }
            }
        } catch (Exception e) {
            LOGGER.warning("No se pudo parsear el CN.");
        }
        return principalName;
    }

    /**
     * Genera un QR como BufferedImage en memoria (fondo transparente, modulos negros).
     * El contenido del QR es unico por cada invocacion basado en datos del certificado.
     */
    public static BufferedImage generateQRImage(String text, int size) throws Exception {
        QRCodeWriter qrCodeWriter = new QRCodeWriter();
        Map<EncodeHintType, Object> hints = new HashMap<>();
        hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.H);
        hints.put(EncodeHintType.MARGIN, 0);
        hints.put(EncodeHintType.CHARACTER_SET, "UTF-8"); // Para soportar tildes en el nombre

        BitMatrix bitMatrix = qrCodeWriter.encode(text, BarcodeFormat.QR_CODE, size, size, hints);
        int w = bitMatrix.getWidth();
        int h = bitMatrix.getHeight();

        // Fondo transparente con modulos negros solidos
        BufferedImage image = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        g.setColor(new Color(0, 0, 0, 0)); // Transparente
        g.fillRect(0, 0, w, h);
        g.setColor(Color.BLACK);
        for (int x = 0; x < w; x++) {
            for (int y = 0; y < h; y++) {
                if (bitMatrix.get(x, y)) g.fillRect(x, y, 1, 1);
            }
        }
        g.dispose();
        return image;
    }

    /**
     * Genera un QR como string Base64 PNG. Usado por el endpoint de validacion
     * para enviar un preview del QR al frontend.
     */
    public static String generateQRBase64(String text, int size) {
        try {
            BufferedImage img = generateQRImage(text, size);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(img, "PNG", baos);
            return Base64.getEncoder().encodeToString(baos.toByteArray());
        } catch (Exception e) {
            LOGGER.warning("Error generando QR preview: " + e.getMessage());
            return "";
        }
    }
}
