//
// DLP_IO8_G  -  interface program
//
// 24.01.2015   v1.0   Sven Giermann <sven.giermann@gmail.com>
//
// Credits to Prof. Juergen Plate
//   http://www.netzmafia.de/skripten/hardware/AD_Wandler/wandler.html

//
// TODO: decode temperature reading
//

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/termios.h>
#include <sys/io.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <signal.h>

// #define _DEGUGLOG


int open_port(char *device) {
  /*
   * Oeffnet seriellen Port
   * Gibt das Filehandle zurueck oder -1 bei Fehler
   *
   * RS232-Parameter
   * - 115200 baud
   * - 8 bits/byte
   * - no parity
   * - no handshake
   * - 1 stop bit
   */
  int fd;
  struct termios options;

  fd = open(device, O_RDWR | O_NOCTTY | O_NDELAY); 
  if (fd >= 0) {
    /* get the current options */
    if (ioctl(fd,TIOCEXCL) != 0)      return(-1);
    if (fcntl(fd, F_SETFL, 0) != 0)   return(-2);
//    if (tcgetattr(fd, &options) != 0) return(-3);
    bzero(&options, sizeof(options)); /* Structure loeschen */

    cfsetspeed(&options, B115200);      /* setze 115200 bps */

    /* setze Optionen */
    options.c_cflag &= ~PARENB;         /* kein Paritybit */
    options.c_cflag &= ~CSTOPB;         /* 1 Stoppbit */
    options.c_cflag &= ~CSIZE;          /* 8 Datenbits */
    options.c_cflag = B115200;
    options.c_cflag |= CS8;
    options.c_cflag |= (CLOCAL | CREAD);/* CD-Signal ignorieren */
    /* Kein Echo, keine Steuerzeichen, keine Interrupts */
    options.c_lflag &= ~(ICANON | ECHO | ECHOE | ISIG);
    options.c_oflag &= ~OPOST;          /* setze "raw" Input */
    options.c_cc[VMIN]  = 1;            /* ORG: 1   warten auf min. 2 Zeichen */
    options.c_cc[VTIME] = 0;            /* ORG: 10  Timeout 1 Sekunde */
    tcflush(fd,TCIOFLUSH);
    if (tcsetattr(fd, TCSAFLUSH, &options) != 0) return(-4);

    fcntl(fd, F_SETFL, FNDELAY);
    fcntl(fd, F_SETFL, 0);
    /* Init Interface: Binary Mode */
  }
  return(fd);
}

int send_command(int fd, char command) {
  /* Kommando an den dlp_io8 senden */
  int result;
  result = write(fd, &command,1);
  return(result);
}
  
int get_analog(int fd, int channel) {
  // Analogwert von dlp_io8 einlesen
  // Der dlp_io8 muss vorher auf Binaerausgabe eingestellt werden (Kommando '\\')
  unsigned char buffer[100];
  int got, intvalue;
  // Kanalzuordnung:
  char chan[8] = {'Z','X','C','V','B','N','M',','};
  // Channel       1   2   3   4   5   6   7   8
  if ((channel < 1) || (channel > 8)) return(-1);
  // flush IO-Buffers
  if (tcflush(fd,TCIOFLUSH) != 0) return(-1); 
  send_command(fd,chan[channel-1]);
  got = read(fd,buffer, sizeof(buffer));   // 2 Byte lesen
  if (got < 2) return(-1);
  intvalue = buffer[0] * 256 + buffer[1];
  return(intvalue);
}

char get_digital(int fd, int channel) {
  // Digitalwert von dlp_io8 einlesen (ascii / binary)
  unsigned char buffer[100];
  int got;
  // Kanalzuordnung:
  char chan[8] = {'A','S','D','F','G','H','J','K'};
  // Channel       1   2   3   4   5   6   7   8
  if ((channel < 1) || (channel > 8)) return(-1);
  // flush IO-Buffers
  if (tcflush(fd,TCIOFLUSH) != 0) return(-1);
  send_command(fd,chan[channel-1]);
  got = read(fd,buffer, sizeof(buffer));   // 2 Byte lesen
  if (got < 1) return(-1);
  return(buffer[0]);
}

int get_temp(int fd, int channel) {
  // Temperatur von dlp_io8 einlesen (DS18B20), Einheit muss vorher gesetzt werden
  // Der dlp_io8 muss vorher auf Binaerausgabe eingestellt werden (Kommando '\\')
  unsigned char buffer[100];
  int got, intvalue;
  // Kanalzuordnung:
  char chan[8] = {'9','0','-','=','O','P','[',']'};
  // Channel       1   2   3   4   5   6   7   8
  if ((channel < 1) || (channel > 8)) return(-1);
  // flush IO-Buffers
  if (tcflush(fd,TCIOFLUSH) != 0) return(-1);
  send_command(fd,chan[channel-1]);
  got = read(fd,buffer, sizeof(buffer));   // 2 Byte lesen
  if (got < 2) return(-1);
  intvalue = buffer[0] * 256 + buffer[1];
  return(intvalue);
}

void set_low(int fd, int channel) {
  // Digitalwert auf LOW setzen
  unsigned char buffer[100];
  int got, intvalue;
  // Kanalzuordnung:
  char chan[8] = {'Q','W','E','R','T','Y','U','I'};
  // Channel       1   2   3   4   5   6   7   8
  if ((channel < 1) || (channel > 8)) return;
  // flush IO-Buffers
  if (tcflush(fd,TCIOFLUSH) != 0) return;
#ifdef _DEGUGLOG
  fprintf(stderr, "set channel %d LOW\n", channel);
#endif
  send_command(fd,chan[channel-1]);
}

void set_high(int fd, int channel) {
  // Digitalwert auf HIGH setzen
  unsigned char buffer[100];
  int got, intvalue;
  // Kanalzuordnung: '1'..'8'
  if ((channel < 1) || (channel > 8)) return;
  // flush IO-Buffers
  if (tcflush(fd,TCIOFLUSH) != 0) return;
#ifdef _DEGUGLOG
  fprintf(stderr, "set channel %d HIGH\n", channel);
#endif
  send_command(fd,channel + '0');
}


void print_a2d(int intvalue, int precision) {
  int i;
  float resist=0, resist2;

  if (precision > 8) precision = 8;
  if (precision < 2) precision = 7;  // default to 7 bit precision if not specified
#ifdef _DEGUGLOG
  fprintf(stderr, "decode %d\n", intvalue);
#endif
  for (i = 1; i <= precision; i++) {
// always 1 bit more precision - and use round to integer
    resist2 = 1.0 / ( (resist > 0 ? 1.0/resist : 0.0) + 1.0/(1<<i) - 1.0/(1<<(precision+1)));
//    if ((float)intvalue > (1023.0 / (1 + resist2))) {
    if (intvalue > (int)(0.5 + 1023.0 / (1 + resist2))) {
#ifdef _DEGUGLOG
      fprintf(stderr, "%d >  %f (%d) ==> 1\n", intvalue, (1023.0 / (1 + resist2)), (int)(0.5 + 1023.0 / (1 + resist2)));
#endif
      resist = 1.0 / ( (resist > 0 ? 1.0/resist : 0.0) + 1.0/(1<<i));
      printf("1");
    } else {
#ifdef _DEGUGLOG
      fprintf(stderr, "%d <= %f (%d) ==> 0\n", intvalue, (1023.0 / (1 + resist2)), (int)(0.5 + 1023.0 / (1 + resist2)));
#endif
      printf("0");
    }
  }

  printf("\n");
}

  
int main(int argc, char **argv) {
  int c=0,fd=-1;

  while ((c = getopt (argc, argv, "d:a:b:i:c:f:0:1:h")) != -1) {
    switch (c) {
      case 'd': // open device
        if (fd >= 0) { // another instance already openedi, need to close it first
          close(fd);
          fd = -1;
        }
        fd = open_port(&optarg[0]);
        if (fd < 0) {
          fprintf(stderr, "ERROR opening device: %s\n", &optarg[0]);
        }
        break;


      case 'a': // analog input
        if (fd > 0 && optarg[0] > '0' && optarg[0] < '9') {
          send_command(fd, '\\'); // set binary output
          printf("%d\n", get_analog(fd, optarg[0] - '0'));
        }
        break;

      case 'b': // analog input -> binary output of AD conversion
        if (fd > 0 && optarg[0] > '0' && optarg[0] < '9') {
          send_command(fd, '\\'); // set binary output
          print_a2d( get_analog(fd, optarg[0] - '0'), optarg[1] - '0' );
        }
        break;

      case 'i': // digital input
        if (fd > 0 && optarg[0] > '0' && optarg[0] < '9') {
          send_command(fd, '\\'); // set binary output
          printf("%d\n", get_digital(fd, optarg[0] - '0'));
        }
        break;


      case 'c': // read temperature
        if (fd > 0 && optarg[0] > '0' && optarg[0] < '9') {
          send_command(fd, '\\'); // set binary output
          send_command(fd, ';'); // set Celsius output
          printf("%d\n", get_temp(fd, optarg[0] - '0'));
        }
        break;

      case 'f': // read temperature
        if (fd > 0 && optarg[0] > '0' && optarg[0] < '9') {
          send_command(fd, '\\'); // set binary output
          send_command(fd, 'L'); // set Fahrenheit output
          printf("%d\n", get_temp(fd, optarg[0] - '0'));
        }
        break;


      case '0': // digital output LOW
        if (fd > 0 && optarg[0] > '0' && optarg[0] < '9') {
          set_low(fd, optarg[0] - '0');
        }
        break;

      case '1': // digital output HIGH
        if (fd > 0 && optarg[0] > '0' && optarg[0] < '9') {
          set_high(fd, optarg[0] - '0');
        }
        break;


      case 'h': //Ausgabe der Hilfe - Show help
      default :
        printf("Usage:\n");
        printf(" -d DEVICE  set device to use\n\n");
        printf(" -a C       read analog value\n");
        printf(" -b C[n]    read binary decode of analog voltage\n");
        printf(" -i C       read digital state\n\n");
        printf(" -c C       read temperature in Celsius\n");
        printf(" -f C       read temperature in Fahrenheit\n\n");
        printf(" -0 C       set channel digital LOW\n");
        printf(" -1 C       set channel digital HIGH\n");
        printf("\n    C = channel number (1..8)\n");
    }
  }


  return(0);
}
 

