import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { SharedModule } from './shared/shared.module';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HomeComponent } from './home/home.component';
import { AboutComponent } from './about/about.component';
import { ContactComponent } from './contact/contact.component';
import { OverviewComponent } from './home/overview/overview.component';
import { DetailsComponent } from './home/details/details.component';
import { TeamComponent } from './about/team/team.component';
import { MissionComponent } from './about/mission/mission.component';
import { InfoComponent } from './contact/info/info.component';
import { FormComponent } from './contact/form/form.component';

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    AboutComponent,
    ContactComponent,
    OverviewComponent,
    DetailsComponent,
    TeamComponent,
    MissionComponent,
    InfoComponent,
    FormComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    SharedModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
